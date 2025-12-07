export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, setDoc, collection } from "firebase/firestore";

export async function POST(request) {
  try {
    const data = await request.json();

    console.log("[YAPE-WEBHOOK] Notificación recibida:", data);

    const { monto, mensaje, timestamp } = data;

    if (!monto || !mensaje || !timestamp) {
      return NextResponse.json(
        { ok: false, error: "Datos incompletos" },
        { status: 400 }
      );
    }

    // Extraemos el monto exacto
    const montoNum = Number(monto);
    if (isNaN(montoNum)) {
      return NextResponse.json(
        { ok: false, error: "Monto inválido" },
        { status: 400 }
      );
    }

    // Guardamos el pago en Firebase
    const pagoRef = doc(collection(db, "pagos_yape"));
    await setDoc(pagoRef, {
      id: pagoRef.id,
      monto: montoNum,
      mensaje,
      timestamp,
      procesado: false,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
