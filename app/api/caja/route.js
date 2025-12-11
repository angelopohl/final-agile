import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  limit,
} from "firebase/firestore";

const getFechaPeru = () => {
  const ahora = new Date().toLocaleString("en-US", {
    timeZone: "America/Lima",
  });
  const dateObj = new Date(ahora);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function GET() {
  try {
    const hoyStr = getFechaPeru();

    // 1. BUSCAR SI HAY SESIÓN
    const sesionesRef = collection(db, "sesiones_caja");
    const qSesion = query(sesionesRef, where("fecha", "==", hoyStr), limit(1));
    const sesionSnap = await getDocs(qSesion);

    let sesionData = null;
    if (!sesionSnap.empty) {
      const d = sesionSnap.docs[0];
      sesionData = { id: d.id, ...d.data() };
    }

    const movimientosHoy = [];

    // --- APERTURA ---
    if (sesionData) {
      movimientosHoy.push({
        id: "apertura-" + sesionData.id,
        tipo: "APERTURA",
        fechaRegistro: sesionData.fechaApertura || new Date().toISOString(),
        monto: sesionData.montoInicial,
        montoTotal: sesionData.montoInicial,
        medioPago: "EFECTIVO",
        descripcion: "Monto Inicial de Apertura",
      });
    }

    // 2. BUSCAR PAGOS (INGRESOS POR COBROS)
    const pagosRef = collection(db, "pagos");
    const qPagos = query(
      pagosRef,
      orderBy("fechaRegistro", "desc"),
      limit(100)
    );
    const pagosSnap = await getDocs(qPagos);

    pagosSnap.forEach((doc) => {
      const data = doc.data();
      const fechaPagoPeru = new Date(data.fechaRegistro).toLocaleString(
        "en-US",
        { timeZone: "America/Lima" }
      );
      const fechaPagoObj = new Date(fechaPagoPeru);
      const year = fechaPagoObj.getFullYear();
      const month = String(fechaPagoObj.getMonth() + 1).padStart(2, "0");
      const day = String(fechaPagoObj.getDate()).padStart(2, "0");
      const fechaPagoStr = `${year}-${month}-${day}`;

      if (fechaPagoStr === hoyStr) {
        movimientosHoy.push({ id: doc.id, ...data, tipo: "PAGO" });
      }
    });

    // 3. BUSCAR INGRESOS EXTRA
    const ingresosRef = collection(db, "ingresos_extra");
    const ingresosSnap = await getDocs(ingresosRef);

    ingresosSnap.forEach((doc) => {
      const data = doc.data();
      const fechaPeru = new Date(data.fechaRegistro).toLocaleString("en-US", {
        timeZone: "America/Lima",
      });
      const fObj = new Date(fechaPeru);
      const fStr = `${fObj.getFullYear()}-${String(
        fObj.getMonth() + 1
      ).padStart(2, "0")}-${String(fObj.getDate()).padStart(2, "0")}`;

      if (fStr === hoyStr) {
        movimientosHoy.push({ id: doc.id, ...data, tipo: "INGRESO" });
      }
    });

    // 4. [NUEVO] BUSCAR EGRESOS EXTRA (SALIDAS MANUALES)
    const egresosRef = collection(db, "egresos_extra");
    const egresosSnap = await getDocs(egresosRef);

    egresosSnap.forEach((doc) => {
      const data = doc.data();
      const fechaPeru = new Date(data.fechaRegistro).toLocaleString("en-US", {
        timeZone: "America/Lima",
      });
      const fObj = new Date(fechaPeru);
      const fStr = `${fObj.getFullYear()}-${String(
        fObj.getMonth() + 1
      ).padStart(2, "0")}-${String(fObj.getDate()).padStart(2, "0")}`;

      if (fStr === hoyStr) {
        movimientosHoy.push({ id: doc.id, ...data, tipo: "EGRESO" });
      }
    });

    // 5. ORDENAR TODO POR FECHA
    movimientosHoy.sort(
      (a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro)
    );

    return NextResponse.json({
      sesion: sesionData,
      pagos: movimientosHoy,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      action,
      montoInicial,
      montoFinal,
      sesionId,
      montoIngreso,
      descripcionIngreso,
      montoEgreso,
      descripcionEgreso,
    } = body;
    const hoyStr = getFechaPeru();

    // --- ABRIR CAJA ---
    if (action === "ABRIR") {
      const sesionesRef = collection(db, "sesiones_caja");
      const q = query(sesionesRef, where("fecha", "==", hoyStr));
      const existe = await getDocs(q);

      if (!existe.empty) {
        return NextResponse.json(
          { error: "Ya existe una caja abierta para hoy" },
          { status: 400 }
        );
      }

      const docRef = await addDoc(sesionesRef, {
        fecha: hoyStr,
        estado: "ABIERTA",
        montoInicial: parseFloat(montoInicial || 0),
        montoFinal: 0,
        fechaApertura: new Date().toISOString(),
        usuario: "admin",
      });
      return NextResponse.json({ ok: true, id: docRef.id });
    }

    // --- CERRAR CAJA ---
    if (action === "CERRAR") {
      if (!sesionId)
        return NextResponse.json({ error: "Falta ID" }, { status: 400 });
      const sesionRef = doc(db, "sesiones_caja", sesionId);
      await updateDoc(sesionRef, {
        estado: "CERRADA",
        montoFinal: parseFloat(montoFinal || 0),
        fechaCierre: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    // --- INGRESO MANUAL ---
    if (action === "INGRESO") {
      if (!montoIngreso)
        return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
      const colRef = collection(db, "ingresos_extra");
      await addDoc(colRef, {
        monto: parseFloat(montoIngreso),
        descripcion: descripcionIngreso,
        fechaRegistro: new Date().toISOString(),
        usuario: "admin",
        medioPago: "EFECTIVO",
      });
      return NextResponse.json({ ok: true });
    }

    // --- EGRESO MANUAL (SALIDAS) ---
    if (action === "EGRESO") {
      if (!montoEgreso)
        return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
      const colRef = collection(db, "egresos_extra");
      await addDoc(colRef, {
        monto: parseFloat(montoEgreso),
        descripcion: descripcionEgreso,
        fechaRegistro: new Date().toISOString(),
        usuario: "admin",
        medioPago: "EFECTIVO",
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
