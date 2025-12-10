import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

const getFechaPeru = () => {
  const ahora = new Date().toLocaleString("en-US", {
    timeZone: "America/Lima",
  });
  const dateObj = new Date(ahora);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function GET() {
  try {
    const hoyStr = getFechaPeru();

    // 1. OBTENER SESIÓN
    const sesionesRef = collection(db, "sesiones_caja");
    const qSesion = query(sesionesRef, where("fecha", "==", hoyStr), limit(1));
    const sesionSnap = await getDocs(qSesion);

    let sesion = null;
    if (!sesionSnap.empty) {
      const d = sesionSnap.docs[0];
      sesion = { id: d.id, ...d.data() };
    }

    // 2. OBTENER PAGOS (COBROS)
    const pagosRef = collection(db, "pagos");
    const qPagos = query(
      pagosRef,
      orderBy("fechaRegistro", "desc"),
      limit(100)
    );
    const pagosSnap = await getDocs(qPagos);

    const movimientosHoy = [];
    let ventasEfectivo = 0;
    let ventasDigital = 0;
    let ingresosExtraTotal = 0;

    // Procesar Pagos
    pagosSnap.forEach((doc) => {
      const data = doc.data();
      const fechaPagoPeru = new Date(data.fechaRegistro).toLocaleString(
        "en-US",
        {
          timeZone: "America/Lima",
        }
      );
      const fechaObj = new Date(fechaPagoPeru);
      const year = fechaObj.getFullYear();
      const month = String(fechaObj.getMonth() + 1).padStart(2, "0");
      const day = String(fechaObj.getDate()).padStart(2, "0");

      if (`${year}-${month}-${day}` === hoyStr) {
        const monto = parseFloat(data.montoTotal || 0);
        movimientosHoy.push({ id: doc.id, ...data, tipo: "PAGO" });

        if (data.medioPago === "EFECTIVO") ventasEfectivo += monto;
        else ventasDigital += monto;
      }
    });

    // 3. OBTENER INGRESOS EXTRA
    const ingresosRef = collection(db, "ingresos_extra");
    const ingresosSnap = await getDocs(ingresosRef);

    ingresosSnap.forEach((doc) => {
      const data = doc.data();
      const fechaPeru = new Date(data.fechaRegistro).toLocaleString("en-US", {
        timeZone: "America/Lima",
      });
      const fechaObj = new Date(fechaPeru);
      const year = fechaObj.getFullYear();
      const month = String(fechaObj.getMonth() + 1).padStart(2, "0");
      const day = String(fechaObj.getDate()).padStart(2, "0");

      if (`${year}-${month}-${day}` === hoyStr) {
        const monto = parseFloat(data.monto || 0);
        movimientosHoy.push({ id: doc.id, ...data, tipo: "INGRESO" });
        ingresosExtraTotal += monto;
      }
    });

    // Ordenar cronológicamente
    movimientosHoy.sort(
      (a, b) => new Date(a.fechaRegistro) - new Date(b.fechaRegistro)
    ); // Ascendente para el reporte impreso

    const montoInicial = sesion ? parseFloat(sesion.montoInicial || 0) : 0;

    // FÓRMULA FINAL: (Base + Ventas Efectivo + Ingresos Extra)
    const efectivoEnCaja = montoInicial + ventasEfectivo + ingresosExtraTotal;
    const ventasTotales = ventasEfectivo + ventasDigital;

    // --- GENERAR PDF ---
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "normal");

    // Encabezado
    pdf.setFontSize(16);
    pdf.setFont(undefined, "bold");
    pdf.text("REPORTE DE CIERRE DE CAJA", 105, 20, { align: "center" });

    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text(`Fecha: ${hoyStr}`, 105, 26, { align: "center" });
    pdf.text(
      `Generado: ${new Date().toLocaleTimeString("en-US", {
        timeZone: "America/Lima",
      })}`,
      105,
      31,
      { align: "center" }
    );

    let y = 45;

    // RESUMEN
    // Caja Izquierda: Estado
    pdf.setDrawColor(0);
    pdf.setFillColor(245, 245, 245);
    pdf.rect(14, y, 85, 40, "F");
    pdf.rect(14, y, 85, 40);

    pdf.setFont(undefined, "bold");
    pdf.text("ESTADO DE CAJA", 20, y + 8);
    pdf.setFont(undefined, "normal");
    pdf.text(`Estado: ${sesion?.estado || "NO APERTURADA"}`, 20, y + 16);
    pdf.text(`Apertura (Base): S/ ${montoInicial.toFixed(2)}`, 20, y + 24);
    pdf.text(`Ingresos Extra: S/ ${ingresosExtraTotal.toFixed(2)}`, 20, y + 32); // Nuevo campo

    if (sesion?.estado === "CERRADA") {
      pdf.text(
        `Cierre Final: S/ ${parseFloat(sesion.montoFinal || 0).toFixed(2)}`,
        20,
        y + 39
      );
    }

    // Caja Derecha: Totales
    pdf.setFillColor(240, 255, 240);
    pdf.rect(110, y, 85, 40, "F");
    pdf.rect(110, y, 85, 40);

    pdf.setFont(undefined, "bold");
    pdf.text("EFECTIVO REAL EN CAJÓN", 116, y + 8);
    pdf.setFontSize(14);
    pdf.text(`S/ ${efectivoEnCaja.toFixed(2)}`, 116, y + 20);
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text(`(Base + Cobros + Ingresos)`, 116, y + 28);

    y += 55;

    // TABLA
    pdf.setFont(undefined, "bold");
    pdf.text("DETALLE DE MOVIMIENTOS", 14, y);
    y += 5;

    pdf.setFillColor(220, 220, 220);
    pdf.rect(14, y, 182, 8, "F");
    pdf.setFontSize(9);
    pdf.text("HORA", 16, y + 5);
    pdf.text("CLIENTE / TIPO", 40, y + 5);
    pdf.text("DESCRIPCIÓN", 85, y + 5);
    pdf.text("MEDIO", 145, y + 5);
    pdf.text("MONTO", 192, y + 5, { align: "right" });

    y += 10;
    pdf.setFont(undefined, "normal");

    movimientosHoy.forEach((m, index) => {
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }

      const hora = new Date(m.fechaRegistro).toLocaleTimeString("en-US", {
        timeZone: "America/Lima",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Lógica de visualización según tipo
      let cliente = "-";
      let desc = "";
      let monto = 0;
      let medio = "EFECTIVO";

      if (m.tipo === "PAGO") {
        cliente = m.dniCliente;
        desc = `Cuota ${m.numeroCuota}`;
        if (m.desglose?.mora > 0) desc += " (+Mora)";
        monto = parseFloat(m.montoTotal).toFixed(2);
        medio = m.medioPago;
      } else {
        // Es un ingreso extra
        cliente = "INGRESO CAJA";
        desc = m.descripcion || "Ingreso manual";
        monto = parseFloat(m.monto).toFixed(2);
        medio = "EFECTIVO";
      }

      if (index % 2 === 0) {
        pdf.setFillColor(250, 250, 250);
        pdf.rect(14, y - 4, 182, 8, "F");
      }

      pdf.text(hora, 16, y);
      pdf.text(cliente, 40, y);
      pdf.text(desc.substring(0, 30), 85, y);
      pdf.text(medio.substring(0, 16), 145, y);
      pdf.text(monto, 192, y, { align: "right" });

      y += 8;
    });

    pdf.line(14, y, 196, y);
    y += 8;

    // Totales pie
    pdf.setFont(undefined, "bold");
    pdf.text(`TOTAL COBROS (Ventas): S/ ${ventasTotales.toFixed(2)}`, 192, y, {
      align: "right",
    });
    y += 5;
    pdf.text(
      `TOTAL INGRESOS EXTRA: S/ ${ingresosExtraTotal.toFixed(2)}`,
      192,
      y,
      { align: "right" }
    );

    // Firma
    y = 260;
    pdf.setLineWidth(0.5);
    pdf.line(70, y, 140, y);
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.text("Firma del Responsable de Caja", 105, y + 5, { align: "center" });

    const pdfBuffer = pdf.output("arraybuffer");

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=cierre_caja_${hoyStr}.pdf`,
      },
    });
  } catch (error) {
    console.error("Error PDF Caja:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
