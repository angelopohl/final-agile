import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, runTransaction, collection } from "firebase/firestore";

export async function POST(request) {
  try {
    const body = await request.json();
    const { prestamoId, numeroCuota, montoPagado, medioPago } = body;

    if (!prestamoId || !numeroCuota || !montoPagado) {
      return NextResponse.json(
        { message: "Missing required payment data" },
        { status: 400 }
      );
    }

    const resultado = await runTransaction(db, async (transaction) => {
      // Obtener préstamo
      const prestamoRef = doc(db, "prestamos", prestamoId);
      const prestamoDoc = await transaction.get(prestamoRef);

      if (!prestamoDoc.exists()) throw new Error("Loan not found");

      const dataPrestamo = prestamoDoc.data();
      const cronograma = dataPrestamo.cronograma;
      const cuotaIndex = cronograma.findIndex((c) => c.num === numeroCuota);

      if (cuotaIndex === -1) throw new Error("Installment not found");

      const cuota = cronograma[cuotaIndex];

      // ============================
      // Cálculo de mora (1% mensual prorrateado)
      // ============================
      const hoy = new Date();
      const fechaVencimiento = new Date(cuota.dueDate);

      const capitalPendiente = cuota.amount - (cuota.capitalPagado || 0);

      let moraCalculada = 0;

      if (hoy > fechaVencimiento && capitalPendiente > 0) {
        const diff = hoy - fechaVencimiento;
        const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
        const meses = Math.max(1, Math.ceil(dias / 30));
        moraCalculada = capitalPendiente * 0.01 * meses;
      }

      const moraPendienteAPagar = moraCalculada - (cuota.moraPagada || 0);

      const montoTotalAPagar = parseFloat(montoPagado);

      let pagoParaMora = 0;
      let pagoParaCapital = 0;
      let remanente = montoTotalAPagar;

      // ============================
      // 1) Pagar mora primero
      // ============================
      if (moraPendienteAPagar > 0) {
        if (remanente >= moraPendienteAPagar) {
          pagoParaMora = moraPendienteAPagar;
          remanente -= moraPendienteAPagar;
        } else {
          pagoParaMora = remanente;
          remanente = 0;
        }
      }

      // ============================
      // 2) Pagar capital después
      // ============================
      if (remanente > 0) {
        if (remanente >= capitalPendiente) {
          pagoParaCapital = capitalPendiente;
        } else {
          pagoParaCapital = remanente;
        }
      }

      const nuevoCapitalPagado = (cuota.capitalPagado || 0) + pagoParaCapital;
      const nuevaMoraPagada = (cuota.moraPagada || 0) + pagoParaMora;

      const isPaid = cuota.amount - nuevoCapitalPagado < 0.01;

      const estadoFinal = isPaid
        ? "PAGADO"
        : nuevoCapitalPagado > 0 || nuevaMoraPagada > 0
        ? "PARCIAL"
        : "PENDIENTE";

      // ============================
      // Actualizar cuota
      // ============================
      cronograma[cuotaIndex] = {
        ...cuota,
        estado: estadoFinal,
        fechaUltimoPago: hoy.toISOString(),
        capitalPagado: nuevoCapitalPagado,
        moraPagada: nuevaMoraPagada,
        moraCalculadaTotal: moraCalculada,
      };

      // ============================
      // Actualizar estado del préstamo
      // ============================
      const prestamoFinalizado = cronograma.every((c) => c.estado === "PAGADO");

      transaction.update(prestamoRef, {
        cronograma,
        estado: prestamoFinalizado ? "FINALIZADO" : "VIGENTE",
      });

      // ============================
      // Crear registro en caja
      // ============================
      const pagoRef = doc(collection(db, "pagos"));
      const nuevoPago = {
        id: pagoRef.id,
        prestamoId,
        dniCliente: dataPrestamo.dniCliente,
        numeroCuota,
        montoTotal: montoTotalAPagar,
        desglose: {
          capital: pagoParaCapital,
          mora: pagoParaMora,
        },
        medioPago, // EFECTIVO o MERCADO_PAGO
        fechaRegistro: hoy.toISOString(),
        usuarioCajero: "admin",
      };

      transaction.set(pagoRef, nuevoPago);

      return {
        estadoCuota: estadoFinal,
        pago: nuevoPago,
      };
    });

    return NextResponse.json({
      message: "Pago registrado",
      comprobante: resultado,
    });
  } catch (error) {
    console.error("Error backend pago:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
