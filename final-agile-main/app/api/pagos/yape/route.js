export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const { prestamoId, numeroCuota, monto, phoneNumber, otp } = body || {};

    // Validaciones iniciales
    if (!prestamoId || !numeroCuota || !monto || !phoneNumber || !otp) {
      return NextResponse.json(
        {
          message:
            "Faltan datos: prestamoId, numeroCuota, monto, phoneNumber, otp",
        },
        { status: 400 }
      );
    }

    const publicKey = process.env.MP_PUBLIC_KEY;
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const baseAppUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    if (!publicKey || !accessToken) {
      return NextResponse.json(
        {
          message:
            "MP_PUBLIC_KEY o MP_ACCESS_TOKEN no configurados en .env.local",
        },
        { status: 500 }
      );
    }

    const montoNum = Number(monto);
    if (Number.isNaN(montoNum) || montoNum <= 0) {
      return NextResponse.json(
        { message: "Monto inválido para pago Yape" },
        { status: 400 }
      );
    }

    // 1) Generar token Yape
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const tokenRes = await fetch(
      `https://api.mercadopago.com/platforms/pci/yape/v1/payment?public_key=${publicKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          otp,
          requestId,
        }),
      }
    );

    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("[YAPE] Error generando token:", tokenJson);
      return NextResponse.json(
        {
          message: "Error al generar token Yape",
          mpError: tokenJson,
          httpStatus: tokenRes.status,
        },
        { status: 400 }
      );
    }

    const yapeToken = tokenJson.id;
    if (!yapeToken) {
      return NextResponse.json(
        {
          message: "Respuesta Yape sin token (id)",
          mpError: tokenJson,
        },
        { status: 400 }
      );
    }

    // 2) Crear pago Yape
    const payerEmail = `cliente.yape.${prestamoId}.c${numeroCuota}@example.com`;

    // Idempotency-Key obligatoria para pagos reales Yape
    const idempotencyKey = `${prestamoId}-${numeroCuota}-${Date.now()}`;

    const payRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        token: yapeToken,
        transaction_amount: montoNum,
        description: `Pago Yape cuota ${numeroCuota}`,
        installments: 1,
        payment_method_id: "yape",
        payer: { email: payerEmail },
      }),
    });

    const payJson = await payRes.json();

    if (!payRes.ok) {
      console.error("[YAPE] Error creando pago:", payJson);
      return NextResponse.json(
        {
          message: "Error al crear pago Yape",
          mpError: payJson,
          httpStatus: payRes.status,
        },
        { status: 400 }
      );
    }

    const mpStatus = payJson.status;
    const mpStatusDetail = payJson.status_detail;
    const mpPaymentId = payJson.id;

    if (mpStatus !== "approved") {
      return NextResponse.json(
        {
          message: "Pago Yape no aprobado",
          mpStatus,
          mpStatusDetail,
          mpPaymentId,
          mpError: payJson,
        },
        { status: 400 }
      );
    }

    // 3) Registrar el pago en tu sistema interno
    const pagosRes = await fetch(`${baseAppUrl}/api/pagos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prestamoId,
        numeroCuota,
        montoPagado: montoNum,
        medioPago: "YAPE_MP",
        referenciaExterna: String(mpPaymentId),
      }),
    });

    const pagosJson = await pagosRes.json();

    if (!pagosRes.ok) {
      console.error("[YAPE] Error registrando pago interno:", pagosJson);
      return NextResponse.json(
        {
          message:
            "Pago Yape aprobado en MP, pero falló el registro en el sistema",
          mpPaymentId,
          mpStatus,
          mpStatusDetail,
          backendError: pagosJson,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Pago Yape aprobado y registrado correctamente",
      mpPaymentId,
      mpStatus,
      mpStatusDetail,
      backend: pagosJson,
    });
  } catch (error) {
    console.error("[YAPE] Error inesperado:", error);
    return NextResponse.json(
      { message: error.message || "Error interno en Yape" },
      { status: 500 }
    );
  }
}
