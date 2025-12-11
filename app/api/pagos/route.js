import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, runTransaction, collection } from "firebase/firestore";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      prestamoId,
      numeroCuota,
      montoPagado,
      medioPago,
      moraCalculadaSnapshot,
      montoRecibido,
    } = body;

    if (!prestamoId || !numeroCuota || !montoPagado) {
      return NextResponse.json(
        { message: "Datos incompletos" },
        { status: 400 }
      );
    }

    const resultado = await runTransaction(db, async (transaction) => {
      // 1. Obtener préstamo
      const prestamoRef = doc(db, "prestamos", prestamoId);
      const prestamoDoc = await transaction.get(prestamoRef);

      if (!prestamoDoc.exists()) throw new Error("Préstamo no encontrado");

      const dataPrestamo = prestamoDoc.data();
      const cronograma = dataPrestamo.cronograma;
      const cuotaIndex = cronograma.findIndex((c) => c.num === numeroCuota);

      if (cuotaIndex === -1) throw new Error("Cuota no encontrada");

      const cuota = cronograma[cuotaIndex];

      // ============================
      // [CORRECCIÓN] FECHA STANDARD
      // ============================
      // Guardamos la hora exacta UTC del servidor.
      // El Frontend se encargará de restarle las 5 horas para mostrarla en Perú.
      const fechaActualISO = new Date().toISOString();

      // ============================
      // 2. CÁLCULO DE MORA
      // ============================
      // Para comparar vencimientos, sí necesitamos saber qué día es en Perú hoy
      const hoyPeru = new Date().toLocaleString("en-US", {
        timeZone: "America/Lima",
      });
      const hoy = new Date(hoyPeru);

      // Normalizar fechas a media noche
      hoy.setHours(0, 0, 0, 0);
      const fechaVencimiento = new Date(cuota.dueDate);
      fechaVencimiento.setHours(0, 0, 0, 0);

      const capitalPendiente = cuota.amount - (cuota.capitalPagado || 0);
      const moraCongeladaPrevia = cuota.moraCongelada || 0;

      let moraActiva = 0;

      if (hoy > fechaVencimiento && capitalPendiente > 0.01) {
        // LÓGICA: 1% FIJO por cuota vencida
        const TASA_MORA = 0.01;
        moraActiva = cuota.amount * TASA_MORA;
      }

      const moraTotalGenerada = moraActiva + moraCongeladaPrevia;

      const moraPendienteAPagar = Math.max(
        0,
        moraTotalGenerada - (cuota.moraPagada || 0)
      );

      const montoTotalAPagar = parseFloat(montoPagado);

      let pagoParaMora = 0;
      let pagoParaCapital = 0;
      let remanente = montoTotalAPagar;

      // 3. DISTRIBUCIÓN DEL PAGO
      // A) Pagar mora primero
      if (moraPendienteAPagar > 0) {
        if (remanente >= moraPendienteAPagar) {
          pagoParaMora = moraPendienteAPagar;
          remanente -= moraPendienteAPagar;
        } else {
          pagoParaMora = remanente;
          remanente = 0;
        }
      }

      // B) Pagar capital después
      if (remanente > 0) {
        if (remanente >= capitalPendiente) {
          pagoParaCapital = capitalPendiente;
        } else {
          pagoParaCapital = remanente;
        }
      }

      // 4. LÓGICA DE ACTUALIZACIÓN
      const nuevoCapitalPagado = (cuota.capitalPagado || 0) + pagoParaCapital;
      const nuevaMoraPagada = (cuota.moraPagada || 0) + pagoParaMora;

      const capitalRestante = cuota.amount - nuevoCapitalPagado;
      const moraRestante = moraTotalGenerada - nuevaMoraPagada;
      // Tolerancia de 0.10 para errores de punto flotante
      const isPaid = capitalRestante < 0.1 && moraRestante < 0.1;

      const estadoCuota = isPaid
        ? "PAGADO"
        : nuevoCapitalPagado > 0 || nuevaMoraPagada > 0
        ? "PARCIAL"
        : "PENDIENTE";

      // 5. ACTUALIZAR CUOTA EN ARRAY
      cronograma[cuotaIndex] = {
        ...cuota,
        estado: estadoCuota,
        fechaUltimoPago: fechaActualISO, // Usamos la fecha UTC corregida
        capitalPagado: nuevoCapitalPagado,
        moraPagada: nuevaMoraPagada,
        moraCongelada: moraCongeladaPrevia, // Mantenemos la mora histórica
        moraCalculadaTotal: moraTotalGenerada,
      };

      // 6. ACTUALIZAR ESTADO DEL PRÉSTAMO
      const prestamoFinalizado = cronograma.every((c) => c.estado === "PAGADO");

      transaction.update(prestamoRef, {
        cronograma,
        estado: prestamoFinalizado ? "FINALIZADO" : "PENDIENTE",
      });

      // 7. CREAR RECIBO DE CAJA
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
        medioPago,
        montoRecibido: montoRecibido || montoPagado,
        fechaRegistro: fechaActualISO, // Usamos la fecha UTC corregida
        usuarioCajero: "admin",
      };

      transaction.set(pagoRef, nuevoPago);

      return {
        estadoCuota: estadoCuota,
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
