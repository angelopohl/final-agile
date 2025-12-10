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
    // 1. CONSULTAR ESTADO DEL PAGO A FLOW
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

    // console.log(">>> 🔍 INSPECCION DE FLOW:", JSON.stringify(data, null, 2)); // Ya vimos que llega bien

    if (!resFlow.ok || !data.commerceOrder) {
      console.error("Error status Flow:", data);
      return NextResponse.json({ error: "No status" }, { status: 400 });
    }

    if (data.status !== 2) {
      return NextResponse.json({ ignored: true });
    }

    // ----------------------------
    // 2. LOGICA INTELIGENTE PARA EL NOMBRE DEL MEDIO DE PAGO
    // ----------------------------
    let medioPagoFinal = "FLOW"; // Valor por defecto

    // ESTRATEGIA 1: Leer la etiqueta 'optional' (CORREGIDA)
    if (data.optional) {
      let optionalData = data.optional;

      // CASO A: Flow nos devuelve un String (JSON String) -> Lo parseamos
      if (typeof optionalData === "string") {
        try {
          optionalData = JSON.parse(optionalData);
        } catch (e) {
          console.warn("Error parseando optional string:", e);
          optionalData = null;
        }
      }

      // CASO B: Flow nos devuelve un Objeto directo (Tu caso actual) -> Lo usamos directo
      // (No hacemos nada porque optionalData ya es el objeto)

      // Verificamos si logramos obtener la etiqueta
      if (optionalData && optionalData.etiqueta) {
        medioPagoFinal = optionalData.etiqueta;
      }
    }

    // ESTRATEGIA 2: Fallback técnico (Solo si la estrategia 1 falló)
    if (
      medioPagoFinal === "FLOW" &&
      data.paymentData &&
      data.paymentData.media
    ) {
      // Nota: En tu log vimos que media llega como "PagoEfectivo" (string),
      // así que el parseInt podría fallar o dar NaN, pero no importa
      // porque la ESTRATEGIA 1 ahora sí funcionará.

      const mediaVal = data.paymentData.media;

      if (mediaVal == 11 || mediaVal === "11") {
        medioPagoFinal = "TARJETA";
      } else if (mediaVal == 29 || mediaVal === "29") {
        medioPagoFinal = "BILLETERA DIGITAL";
      }
    }

    // ----------------------------
    // 3. SEPARAR ID DE LA ORDEN
    // ----------------------------
    const [prestamoId, cuotaStr] = data.commerceOrder.split("-C");
    const numeroCuota = parseInt(cuotaStr);

    // ----------------------------
    // 4. GUARDAR EN FIREBASE
    // ----------------------------
    const pagoRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/pagos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prestamoId,
          numeroCuota,
          montoPagado: data.amount,
          medioPago: medioPagoFinal,
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
