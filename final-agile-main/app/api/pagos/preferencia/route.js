export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

export async function POST(req) {
  try {
    const body = await req.json();
    const { prestamoId, numeroCuota, monto, descripcion } = body || {};

    // Validación básica
    if (!prestamoId || !numeroCuota || !monto) {
      return NextResponse.json(
        {
          error: "Faltan campos obligatorios (prestamoId, numeroCuota, monto)",
        },
        { status: 400 }
      );
    }

    if (!process.env.MP_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: "MP_ACCESS_TOKEN no configurado en .env.local" },
        { status: 500 }
      );
    }

    // Cliente MP
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // Crear preferencia
    const result = await preference.create({
      body: {
        items: [
          {
            id: `${prestamoId}-C${numeroCuota}`,
            title: descripcion || `Pago de Cuota ${numeroCuota}`,
            description: `Pago correspondiente a la cuota ${numeroCuota} del préstamo ${prestamoId}`,
            category_id: "services",
            quantity: 1,
            unit_price: Number(monto),
            currency_id: "PEN",
          },
        ],

        external_reference: `${prestamoId}-C${numeroCuota}`,

        statement_descriptor: "MI NEGOCIO",

        notification_url: `${baseUrl}/api/pagos/webhook`,

        payer: {
          email: body.email || "testuser@example.com",
          first_name: body.nombre || "Cliente",
          last_name: body.apellido || "Final",
        },

        back_urls: {
          success: `${baseUrl}/dashboard/prestamos/${prestamoId}?status=success`,
          failure: `${baseUrl}/dashboard/prestamos/${prestamoId}?status=failure`,
          pending: `${baseUrl}/dashboard/prestamos/${prestamoId}?status=pending`,
        },

        payment_methods: {
          excluded_payment_types: [],
          installments: 1,
        },

        // Opcional para pruebas
        binary_mode: false,
      },
    });

    // OJO: el SDK que tienes retorna init_point en la RAÍZ,
    // no en result.body
    const initPoint = result?.init_point || result?.body?.init_point;

    if (!initPoint) {
      console.error("[MP_PREF] init_point no encontrado en respuesta:", result);
      return NextResponse.json(
        { error: "MercadoPago no devolvió init_point" },
        { status: 500 }
      );
    }

    // Todo bien: devolvemos el link de pago
    return NextResponse.json({ init_point: initPoint });
  } catch (err) {
    console.error("[MP_PREF] Error general:", err);
    return NextResponse.json(
      { error: err?.message || "Error interno en preferencia" },
      { status: 500 }
    );
  }
}
