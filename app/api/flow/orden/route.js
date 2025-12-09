import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req) {
  try {
    const body = await req.json();
    const { prestamoId, numeroCuota, monto, billetera } = body;

    // Validamos que los parámetros esenciales estén presentes
    if (!prestamoId || !numeroCuota || !monto) {
      return NextResponse.json(
        { error: "Faltan datos: prestamoId, numeroCuota, monto" },
        { status: 400 }
      );
    }

    const emailCliente = "cliente@miempresa.com";
    const apiKey = process.env.FLOW_API_KEY;
    const secretKey = process.env.FLOW_API_SECRET;
    const apiUrl = process.env.FLOW_API_URL;

    const commerceOrder = `${prestamoId}-C${numeroCuota}`;
    const subject = `Pago cuota ${numeroCuota}`;
    const currency = "PEN";
    const amount = monto;

    const urlReturn = `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/prestamos/${prestamoId}`;
    const urlNotify = `${process.env.NEXT_PUBLIC_BASE_URL}/api/flow/webhook`;

    // Se configura el paymentMethod según si el pago es con billetera o tarjeta
    const paymentMethod = billetera ? 29 : 11; // 29 = Yape/Billetera, 11 = Tarjetas

    // --- [NUEVO] DEFINIMOS LA ETIQUETA EXACTA ---
    const etiquetaPago = billetera ? "BILLETERA DIGITAL" : "TARJETA";

    const params = {
      apiKey,
      commerceOrder,
      subject,
      currency,
      amount,
      email: emailCliente,
      paymentMethod,
      urlConfirmation: urlNotify,
      urlReturn,
      // --- [NUEVO] AGREGAMOS EL CAMPO OPTIONAL ---
      // Esto viaja a Flow y regresa en el Webhook. No afecta al usuario.
      optional: JSON.stringify({ etiqueta: etiquetaPago }),
    };

    // Ordenamos los parámetros alfabéticamente (Flow lo exige)
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    // Creamos la firma (incluyendo el campo optional nuevo)
    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(queryString)
      .digest("hex");

    const formBody = new URLSearchParams({
      ...params,
      s: signature,
    });

    // Creamos la orden en Flow
    const res = await fetch(`${apiUrl}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });

    const dataFlow = await res.json();

    if (!res.ok || !dataFlow.url || !dataFlow.token) {
      console.error("Error Flow:", dataFlow);
      return NextResponse.json(
        { error: dataFlow.message || "Error creando orden Flow" },
        { status: 400 }
      );
    }

    const urlPago = `${dataFlow.url}?token=${dataFlow.token}`;

    return NextResponse.json({ urlPago });
  } catch (err) {
    console.error("FLOW_ORDEN Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
