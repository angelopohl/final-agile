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

// Función para obtener la fecha de hoy en Perú
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

    // 1. OBTENER DATOS DE LA SESIÓN
    const sesionesRef = collection(db, "sesiones_caja");
    const qSesion = query(sesionesRef, where("fecha", "==", hoyStr), limit(1));
    const sesionSnap = await getDocs(qSesion);

    let sesion = null;
    if (!sesionSnap.empty) {
      const d = sesionSnap.docs[0];
      sesion = { id: d.id, ...d.data() };
    }

    // 2. OBTENER LOS PAGOS DE HOY
    const pagosRef = collection(db, "pagos");
    const qPagos = query(
      pagosRef,
      orderBy("fechaRegistro", "desc"),
      limit(100)
    );
    const pagosSnap = await getDocs(qPagos);

    const pagosHoy = [];
    let ventasEfectivo = 0;
    let ventasDigital = 0;

    pagosSnap.forEach((doc) => {
      const data = doc.data();
      // Filtrar por fecha Perú
      const fechaPagoPeru = new Date(data.fechaRegistro).toLocaleString(
        "en-US",
        {
          timeZone: "America/Lima",
        }
      );
      const fechaPagoObj = new Date(fechaPagoPeru);
      const year = fechaPagoObj.getFullYear();
      const month = String(fechaPagoObj.getMonth() + 1).padStart(2, "0");
      const day = String(fechaPagoObj.getDate()).padStart(2, "0");
      const fechaPagoStr = `${year}-${month}-${day}`;

      if (fechaPagoStr === hoyStr) {
        const monto = parseFloat(data.montoTotal || 0);
        pagosHoy.push({ id: doc.id, ...data });

        if (data.medioPago === "EFECTIVO") ventasEfectivo += monto;
        else ventasDigital += monto;
      }
    });

    const montoInicial = sesion ? parseFloat(sesion.montoInicial || 0) : 0;
    const efectivoEnCaja = montoInicial + ventasEfectivo;
    const ventasTotales = ventasEfectivo + ventasDigital;

    // 3. GENERAR EL PDF
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "normal");

    // -- Encabezado --
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

    // -- Cuadros de Resumen --
    let y = 45;

    // Cuadro Izquierdo: Estado
    pdf.setDrawColor(0);
    pdf.setFillColor(245, 245, 245);
    pdf.rect(14, y, 85, 35, "F");
    pdf.rect(14, y, 85, 35);

    pdf.setFont(undefined, "bold");
    pdf.text("ESTADO DE CAJA", 20, y + 8);
    pdf.setFont(undefined, "normal");
    pdf.text(`Estado: ${sesion?.estado || "NO APERTURADA"}`, 20, y + 16);
    pdf.text(`Apertura (Base): S/ ${montoInicial.toFixed(2)}`, 20, y + 24);
    if (sesion?.estado === "CERRADA") {
      pdf.text(
        `Cierre Final: S/ ${parseFloat(sesion.montoFinal || 0).toFixed(2)}`,
        20,
        y + 32
      );
    }

    // Cuadro Derecho: Totales
    pdf.setFillColor(240, 255, 240);
    pdf.rect(110, y, 85, 35, "F");
    pdf.rect(110, y, 85, 35);

    pdf.setFont(undefined, "bold");
    pdf.text("EFECTIVO REAL EN CAJÓN", 116, y + 8);
    pdf.setFontSize(14);
    pdf.text(`S/ ${efectivoEnCaja.toFixed(2)}`, 116, y + 20);
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text(`(Base + Ventas Efectivo)`, 116, y + 28);

    y += 50;

    // -- Tabla de Movimientos --
    pdf.setFont(undefined, "bold");
    pdf.text("DETALLE DE MOVIMIENTOS", 14, y);
    y += 5;

    // Cabecera
    pdf.setFillColor(220, 220, 220);
    pdf.rect(14, y, 182, 8, "F");
    pdf.setFontSize(9);
    pdf.text("HORA", 16, y + 5);
    pdf.text("CLIENTE (DNI)", 40, y + 5);
    pdf.text("DESCRIPCIÓN", 85, y + 5);
    pdf.text("MEDIO", 145, y + 5);
    pdf.text("MONTO", 192, y + 5, { align: "right" });

    y += 10;
    pdf.setFont(undefined, "normal");

    // Filas
    pagosHoy.forEach((p, index) => {
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }

      const hora = new Date(p.fechaRegistro).toLocaleTimeString("en-US", {
        timeZone: "America/Lima",
        hour: "2-digit",
        minute: "2-digit",
      });
      const monto = parseFloat(p.montoTotal).toFixed(2);

      // Color alternado
      if (index % 2 === 0) {
        pdf.setFillColor(250, 250, 250);
        pdf.rect(14, y - 4, 182, 8, "F");
      }

      pdf.text(hora, 16, y);
      pdf.text(p.dniCliente || "-", 40, y);

      let desc = `Cuota ${p.numeroCuota}`;
      if (p.desglose?.mora > 0) desc += " (+Mora)";
      pdf.text(desc, 85, y);

      pdf.text(p.medioPago.substring(0, 16), 145, y);
      pdf.text(monto, 192, y, { align: "right" });

      y += 8;
    });

    pdf.line(14, y, 196, y);
    y += 8;

    pdf.setFont(undefined, "bold");
    pdf.text(
      `TOTAL VENTAS (Inc. Digital):  S/ ${ventasTotales.toFixed(2)}`,
      192,
      y,
      { align: "right" }
    );

    // -- Firma --
    y = 260;
    pdf.setLineWidth(0.5);
    pdf.line(70, y, 140, y);
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.text("Firma del Responsable de Caja", 105, y + 5, { align: "center" });

    // RETORNAR EL PDF
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
