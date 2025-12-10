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

    // 2. BUSCAR PAGOS
    const pagosRef = collection(db, "pagos");
    const qPagos = query(
      pagosRef,
      orderBy("fechaRegistro", "desc"),
      limit(100)
    );
    const pagosSnap = await getDocs(qPagos);

    const pagosHoy = [];
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
        pagosHoy.push({ id: doc.id, ...data });
      }
    });

    return NextResponse.json({
      sesion: sesionData,
      pagos: pagosHoy,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, montoInicial, montoFinal, sesionId } = body;
    const hoyStr = getFechaPeru();

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

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
