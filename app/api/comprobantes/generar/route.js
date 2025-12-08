import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";

export async function POST(req) {
  try {
    const { prestamoId, numeroCuota, monto, medioPago, cliente } =
      await req.json();

    if (!prestamoId || !numeroCuota || !monto || !cliente) {
      return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    }

    // --- GENERACIÓN DEL PDF (Diseño v2.0) ---
    const doc = new jsPDF();
    const fechaActual = new Date();
    const fechaFormateada = fechaActual.toISOString().split("T")[0];
    const horaFormateada = fechaActual.toTimeString().split(" ")[0];
    const numeroComprobante = `0000${Math.floor(Math.random() * 1000)}`.slice(
      -3
    );

    let yPos = 20;

    // Encabezado
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("PRESTAPE S.A.C.", 105, yPos, { align: "center" });
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("RUC: 20721834495", 105, yPos, { align: "center" });
    yPos += 5;
    doc.text("DIRECCIÓN FISCAL: Trujillo - Trujillo - Perú", 105, yPos, {
      align: "center",
    });
    yPos += 10;
    doc.setLineWidth(0.5);
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    // Título
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text("COMPROBANTE DE PAGO", 105, yPos, { align: "center" });
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Número: ${numeroComprobante}`, 14, yPos);
    doc.text(`Fecha: ${fechaFormateada} ${horaFormateada}`, 14, yPos + 6);
    doc.text(`Medio Pago: ${medioPago}`, 14, yPos + 12);

    yPos += 20;
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    // Datos Cliente
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("CLIENTE", 14, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Nombre: ${cliente.nombre || "N/A"}`, 14, yPos);
    doc.text(`DNI: ${cliente.numero_documento || "N/A"}`, 14, yPos + 6);

    yPos += 15;
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    // Detalles
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DETALLE", 14, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Préstamo ID: ${prestamoId}`, 14, yPos);
    doc.text(`Cuota N°: ${numeroCuota}`, 14, yPos + 6);

    yPos += 15;
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(`TOTAL PAGADO: S/ ${monto.toFixed(2)}`, 14, yPos);

    yPos += 20;
    doc.setFontSize(8);
    doc.setFont(undefined, "italic");
    doc.text(
      "Este documento es un comprobante de pago electrónico.",
      105,
      yPos,
      { align: "center" }
    );

    // --- CLAVE: DEVOLVER EL ARCHIVO AL NAVEGADOR ---
    // Usamos output('arraybuffer') para obtener los datos binarios del PDF
    const pdfBuffer = doc.output("arraybuffer");

    // Devolvemos una respuesta con el tipo de contenido correcto
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=comprobante_${prestamoId}_${numeroCuota}.pdf`,
      },
      status: 200,
    });
  } catch (err) {
    console.error("Error generando PDF:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
