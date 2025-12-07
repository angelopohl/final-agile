import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";

// CLIENTE MP
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ========== GET (IPN PRUEBA Y CONSULTAS) ==========
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic");
    const paymentId = url.searchParams.get("id");

    // Si no es pago real → responder sin procesar
    if (topic !== "payment" || !paymentId) {
      return NextResponse.json({ received: true });
    }

    const mp = new Payment(client);
    let paymentInfo;

    try {
      paymentInfo = await mp.get({ id: paymentId });
    } catch (e) {
      // MP no encontró el pago → NO es error del servidor
      return NextResponse.json({ ignored: true });
    }

    // Si no está aprobado → solo responder OK
    if (!paymentInfo || paymentInfo.status !== "approved") {
      return NextResponse.json({ ignored: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("WEBHOOK_GET_ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 200 });
  }
}

// ========== POST (WEBHOOK REAL) ==========
export async function POST(req) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = data.id;

    const mp = new Payment(client);
    let paymentInfo;

    try {
      paymentInfo = await mp.get({ id: paymentId });
    } catch (e) {
      return NextResponse.json({ ignored: true });
    }

    // Si no está aprobado → no procesar
    if (!paymentInfo || paymentInfo.status !== "approved") {
      return NextResponse.json({ ignored: true });
    }

    // EXTRAER external_reference
    const external = paymentInfo.external_reference;
    if (!external) {
      return NextResponse.json({ error: "missing external_reference" });
    }

    // Aquí puedes procesar Firestore si quieres, ya con datos reales.
    // OJO: Esto solo debe ejecutarse en POST, NO en GET.
    console.log("PAGO APROBADO:", paymentId, external);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("WEBHOOK_POST_ERROR:", e);
    return NextResponse.json({ error: e.message }, { status: 200 });
  }
}
