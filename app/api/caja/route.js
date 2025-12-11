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

    // --- NUEVO: SI HAY SESIÓN, AGREGAMOS EL MONTO INICIAL COMO MOVIMIENTO ---
    if (sesionData) {
      movimientosHoy.push({
        id: "apertura-" + sesionData.id, // ID único artificial
        tipo: "APERTURA", // Nuevo tipo para identificarlo
        fechaRegistro: sesionData.fechaApertura || new Date().toISOString(),
        monto: sesionData.montoInicial,
        montoTotal: sesionData.montoInicial, // Para compatibilidad
        medioPago: "EFECTIVO",
        descripcion: "Monto Inicial de Apertura",
      });
    }
    // -----------------------------------------------------------------------

    // 2. BUSCAR PAGOS (COBROS DE PRÉSTAMOS)
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
        {
          timeZone: "America/Lima",
        }
      );
      const fechaPagoObj = new Date(fechaPagoPeru);
      const year = fechaPagoObj.getFullYear();
      const month = String(fechaPagoObj.getMonth() + 1).padStart(2, "0");
      const day = String(fechaPagoObj.getDate()).padStart(2, "0");
      const fechaPagoStr = `${year}-${month}-${day}`;

      if (fechaPagoStr === hoyStr) {
        // Marcamos el tipo para el frontend
        movimientosHoy.push({ id: doc.id, ...data, tipo: "PAGO" });
      }
    });

    // 3. BUSCAR INGRESOS EXTRA (DINERO MANUAL)
    const ingresosRef = collection(db, "ingresos_extra");
    // Filtramos en memoria igual que pagos para asegurar fecha exacta
    const ingresosSnap = await getDocs(ingresosRef);

    ingresosSnap.forEach((doc) => {
      const data = doc.data();
      const fechaIngresoPeru = new Date(data.fechaRegistro).toLocaleString(
        "en-US",
        {
          timeZone: "America/Lima",
        }
      );
      const fechaObj = new Date(fechaIngresoPeru);
      const year = fechaObj.getFullYear();
      const month = String(fechaObj.getMonth() + 1).padStart(2, "0");
      const day = String(fechaObj.getDate()).padStart(2, "0");
      const fechaStr = `${year}-${month}-${day}`;

      if (fechaStr === hoyStr) {
        movimientosHoy.push({ id: doc.id, ...data, tipo: "INGRESO" });
      }
    });

    // 4. ORDENAR TODO POR FECHA (MÁS RECIENTE PRIMERO)
    movimientosHoy.sort(
      (a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro)
    );

    return NextResponse.json({
      sesion: sesionData,
      pagos: movimientosHoy, // Enviamos la lista combinada
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

      const nuevaSesion = {
        fecha: hoyStr,
        estado: "ABIERTA",
        montoInicial: parseFloat(montoInicial || 0),
        montoFinal: 0,
        fechaApertura: new Date().toISOString(),
        usuario: "admin",
      };

      const docRef = await addDoc(sesionesRef, nuevaSesion);
      return NextResponse.json({ ok: true, id: docRef.id });
    }

    // --- CERRAR CAJA ---
    if (action === "CERRAR") {
      if (!sesionId)
        return NextResponse.json(
          { error: "Falta ID de sesión" },
          { status: 400 }
        );
      const sesionRef = doc(db, "sesiones_caja", sesionId);
      await updateDoc(sesionRef, {
        estado: "CERRADA",
        montoFinal: parseFloat(montoFinal || 0),
        fechaCierre: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }

    // --- NUEVO: INGRESAR DINERO EXTRA ---
    if (action === "INGRESO") {
      if (!montoIngreso || !descripcionIngreso) {
        return NextResponse.json(
          { error: "Faltan datos de ingreso" },
          { status: 400 }
        );
      }

      const ingresosRef = collection(db, "ingresos_extra");
      const nuevoIngreso = {
        monto: parseFloat(montoIngreso),
        descripcion: descripcionIngreso,
        fechaRegistro: new Date().toISOString(), // Se guarda en UTC, el GET lo convierte
        usuario: "admin",
        medioPago: "EFECTIVO", // Asumimos efectivo para caja chica
      };

      await addDoc(ingresosRef, nuevoIngreso);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
