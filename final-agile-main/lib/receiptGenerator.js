import jsPDF from "jspdf";

export const generarComprobantePDF = (pago) => {
  // Formato Ticket Térmico (80mm ancho)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 200],
  });

  let y = 10;
  const centerX = 40;

  // --- Encabezado ---
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("PrestaPe S.A.C.", centerX, y, { align: "center" });
  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("RUC: 20123456789", centerX, y, { align: "center" });
  y += 5;
  doc.text("Recibo de Cobranza", centerX, y, { align: "center" });
  y += 8;

  doc.line(5, y, 75, y);
  y += 5;

  // --- Datos ---
  doc.setFontSize(9);
  doc.text(`Fecha: ${new Date(pago.fechaRegistro).toLocaleString()}`, 5, y);
  y += 5;
  doc.text(`Cliente DNI: ${pago.dniCliente}`, 5, y);
  y += 5;
  doc.text(`ID Pago: ${pago.id.slice(0, 8)}`, 5, y);
  y += 8;

  // --- Desglose ---
  doc.setFont("helvetica", "bold");
  doc.text("CONCEPTO", 5, y);
  doc.text("IMPORTE", 75, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");

  // Capital
  if (pago.desglose.capital > 0) {
    doc.text(`Cuota N° ${pago.numeroCuota}`, 5, y);
    doc.text(`S/ ${pago.desglose.capital.toFixed(2)}`, 75, y, {
      align: "right",
    });
    y += 5;
  }

  // Mora
  if (pago.desglose.mora > 0) {
    doc.text(`Mora / Penalidad`, 5, y);
    doc.text(`S/ ${pago.desglose.mora.toFixed(2)}`, 75, y, { align: "right" });
    y += 5;
  }

  doc.line(5, y, 75, y);
  y += 5;

  // --- Total ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL PAGADO", 5, y);
  doc.text(`S/ ${pago.montoTotal.toFixed(2)}`, 75, y, { align: "right" });
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Medio de Pago: ${pago.medioPago}`, 5, y);
  y += 10;

  // --- Pie ---
  doc.setFontSize(8);
  doc.text("Gracias por su pago.", centerX, y, { align: "center" });

  // Descargar
  doc.save(`Ticket_${pago.dniCliente}_${pago.numeroCuota}.pdf`);
};
