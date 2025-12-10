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
      // [MEJORA] DEFINIR HORA PERÚ
      // ============================
      // Esto congela la hora actual en Lima para guardarla en la BD
      const fechaActualPeru = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
      );
      const fechaActualISO = fechaActualPeru.toISOString();

      // ============================
      // 2. CÁLCULO DE MORA (Tu lógica matemática robusta)
      // ============================
      // Usamos la hora de Perú también para comparar si venció o no
      const hoy = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
      );
      
      // Normalizar fechas para evitar errores de horas
      hoy.setHours(0, 0, 0, 0);
      const fechaVencimiento = new Date(cuota.dueDate);
      fechaVencimiento.setHours(0, 0, 0, 0);

      const capitalPendiente = cuota.amount - (cuota.capitalPagado || 0);
      const moraCongeladaPrevia = cuota.moraCongelada || 0;

      let moraActiva = 0;
      let diasAtraso = 0;

      if (hoy > fechaVencimiento && capitalPendiente > 0.01) {
        const msPorDia = 1000 * 60 * 60 * 24;
        const diff = hoy - fechaVencimiento;
        diasAtraso = Math.ceil(diff / msPorDia);

        // Tasa diaria basada en 1% mensual (Tu fórmula correcta)
        const tasaDiaria = 0.01 / 30;

        moraActiva = capitalPendiente * tasaDiaria * diasAtraso;
      }

      // Mora Total Generada = Lo activo hoy + Lo histórico congelado
      const moraTotalGenerada = moraActiva + moraCongeladaPrevia;

      // Deuda neta de mora
      const moraPendienteAPagar = Math.max(
        0,
        moraTotalGenerada - (cuota.moraPagada || 0)
      );

      const montoTotalAPagar = parseFloat(montoPagado);

      let pagoParaMora = 0;
      let pagoParaCapital = 0;
      let remanente = montoTotalAPagar;

      // ============================
      // 3. DISTRIBUCIÓN DEL PAGO
      // ============================

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
        // Validamos no pagar más del capital pendiente
        if (remanente >= capitalPendiente) {
          pagoParaCapital = capitalPendiente;
        } else {
          pagoParaCapital = remanente;
        }
      }

      // ============================
      // 4. LÓGICA DE CONGELAMIENTO (La clave que evita errores futuros)
      // ============================
      let nuevaMoraCongelada = moraCongeladaPrevia;

      if (pagoParaCapital > 0 && diasAtraso > 0) {
        // Calculamos cuánta mora corresponde EXACTAMENTE al capital que estamos matando
        const tasaDiaria = 0.01 / 30;
        const moraDelCapitalPagado = pagoParaCapital * tasaDiaria * diasAtraso;

        // La sumamos al acumulado histórico
        nuevaMoraCongelada += moraDelCapitalPagado;
      }

      const nuevoCapitalPagado = (cuota.capitalPagado || 0) + pagoParaCapital;
      const nuevaMoraPagada = (cuota.moraPagada || 0) + pagoParaMora;

      const isPaid = cuota.amount - nuevoCapitalPagado < 0.01;

      // Estado de la CUOTA (Este es solo visual para la tabla)
      const estadoCuota = isPaid
        ? "PAGADO"
        : nuevoCapitalPagado > 0 || nuevaMoraPagada > 0
        ? "PARCIAL"
        : "PENDIENTE";

      // ============================
      // 5. ACTUALIZAR CUOTA EN ARRAY
      // ============================
      cronograma[cuotaIndex] = {
        ...cuota,
        estado: estadoCuota,
        fechaUltimoPago: fechaActualISO, // <--- CAMBIO 1: Fecha Perú
        capitalPagado: nuevoCapitalPagado,
        moraPagada: nuevaMoraPagada,
        // Guardamos el nuevo campo vital
        moraCongelada: nuevaMoraCongelada,
        // Campo informativo
        moraCalculadaTotal: moraTotalGenerada,
      };

      // ============================
      // 6. ACTUALIZAR ESTADO DEL PRÉSTAMO (LÓGICA DE AMIGO)
      // ============================
      const prestamoFinalizado = cronograma.every((c) => c.estado === "PAGADO");

      transaction.update(prestamoRef, {
        cronograma,
        // CAMBIO CRÍTICO: Si no finalizó, se mantiene PENDIENTE (nunca VIGENTE)
        estado: prestamoFinalizado ? "FINALIZADO" : "PENDIENTE",
      });

      // ============================
      // 7. CREAR RECIBO DE CAJA
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
        medioPago,
        montoRecibido: montoRecibido || montoPagado,
        fechaRegistro: fechaActualISO, // <--- CAMBIO 2: Fecha Perú
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