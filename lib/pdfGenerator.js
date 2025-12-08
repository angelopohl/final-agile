import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generarPDFCronograma = (prestamo) => {
  const doc = new jsPDF();

  // --- Configuración ---
  const colors = {
    primary: [16, 185, 129], // Verde
    text: [60, 60, 60],
    secondary: [150, 150, 150],
  };

  // --- 1. Encabezado ---
  doc.setFontSize(22);
  doc.setTextColor(...colors.primary);
  doc.text("Sistema de Préstamos Agile", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(...colors.secondary);
  doc.text("Reporte de Cronograma de Pagos", 14, 28);
  doc.line(14, 32, 196, 32); // Línea separadora

  // --- 2. Datos del Cliente y Préstamo ---
  doc.setFontSize(12);
  doc.setTextColor(...colors.text);

  const startY = 45;
  // Columna Izquierda
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", 14, startY);
  doc.setFont("helvetica", "normal");
  doc.text(prestamo.dniCliente, 40, startY);

  doc.setFont("helvetica", "bold");
  doc.text("Monto:", 14, startY + 8);
  doc.setFont("helvetica", "normal");
  doc.text(`S/ ${prestamo.montoSolicitado.toFixed(2)}`, 40, startY + 8);

  // Columna Derecha
  doc.setFont("helvetica", "bold");
  doc.text("ID Préstamo:", 110, startY);
  doc.setFont("helvetica", "normal");
  doc.text(prestamo.id || "---", 140, startY);

  doc.setFont("helvetica", "bold");
  doc.text("Fecha Inicio:", 110, startY + 8);
  doc.setFont("helvetica", "normal");

  const fecha = prestamo.fechaInicio
    ? new Date(prestamo.fechaInicio).toLocaleDateString()
    : "-";
  doc.text(fecha, 140, startY + 8);

  // --- 3. Tabla de Cronograma ---
  const tableColumn = [
    "N°",
    "Vencimiento",
    "Cuota (S/)",
    "Interés",
    "Amortización",
    "Saldo",
    "Estado", // Agregué estado para mayor claridad
  ];
  const tableRows = [];

  prestamo.cronograma.forEach((cuota) => {
    const cuotaData = [
      cuota.num,
      new Date(cuota.dueDate).toLocaleDateString(),
      cuota.amount.toFixed(2),
      cuota.interest.toFixed(2),
      cuota.capital.toFixed(2),
      cuota.balance.toFixed(2),
      cuota.estado || "PENDIENTE",
    ];
    tableRows.push(cuotaData);
  });

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: startY + 20,
    theme: "grid",
    headStyles: { fillColor: colors.primary },
    styles: { fontSize: 9 },
  });

  // --- 4. Pie de Página ---
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...colors.secondary);
    doc.text(
      `Página ${i} de ${pageCount} - Generado el ${new Date().toLocaleDateString()}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  // --- 5. Descargar ---
  doc.save(`Cronograma_${prestamo.dniCliente}.pdf`);
};
