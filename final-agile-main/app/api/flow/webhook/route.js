import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req) {
  try {
    const body = await req.formData();
    const token = body.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const apiKey = process.env.FLOW_API_KEY;
    const secretKey = process.env.FLOW_API_SECRET;
    const apiUrl = process.env.FLOW_API_URL;

    // ----------------------------
    // CONSULTAR ESTADO DEL PAGO
    // ----------------------------
    const params = { apiKey, token };

    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");

    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(queryString)
      .digest("hex");

    const url = `${apiUrl}/payment/getStatus?${queryString}&s=${signature}`;

    const resFlow = await fetch(url);
    const data = await resFlow.json();

    if (!resFlow.ok || !data.commerceOrder) {
      console.error("Error status Flow:", data);
      return NextResponse.json({ error: "No status" }, { status: 400 });
    }

    if (data.status !== 2) {
      // 2 = pagado
      return NextResponse.json({ ignored: true });
    }

    // ----------------------------
    // SEPARAR COMMERCE ORDER
    // prestamoId-CnumeroCuota
    // ----------------------------
    const [prestamoId, cuotaStr] = data.commerceOrder.split("-C");
    const numeroCuota = parseInt(cuotaStr);

    // Registrar pago en Firestore usando tu API existente
    const pagoRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/pagos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prestamoId,
          numeroCuota,
          montoPagado: data.amount,
          medioPago: "FLOW",
        }),
      }
    );

    if (!pagoRes.ok) {
      console.error("Error registrando pago:", await pagoRes.text());
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("FLOW_WEBHOOK Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
