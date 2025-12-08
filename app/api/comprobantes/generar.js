// app/api/comprobantes/generar.js
// Versión actualizada: 2025-12-07 v2.0 (Diseño de tu amiga)

import { jsPDF } from "jspdf";

export async function POST(req) {
  if (req.method === "POST") {
    try {
      const { prestamoId, numeroCuota, monto, medioPago, cliente } =
        await req.json();

      if (!prestamoId || !numeroCuota || !monto || !cliente) {
        return new Response(JSON.stringify({ error: "Faltan datos." }), {
          status: 400,
        });
      }

      const doc = new jsPDF();
      const fechaActual = new Date();
      const fechaFormateada = fechaActual.toISOString().split("T")[0];
      const horaFormateada = fechaActual.toTimeString().split(" ")[0];
      const numeroComprobante = `0000${Math.floor(Math.random() * 1000)}`.slice(
        -3
      );

      let yPos = 20;

      // --- ENCABEZADO ---
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

      yPos += 5;
      doc.text("Web: https://final-agile.vercel.app/dashboard", 105, yPos, {
        align: "center",
      });

      yPos += 10;
      doc.setLineWidth(0.5);
      doc.line(14, yPos, 196, yPos);

      yPos += 10;

      // --- TÍTULO ---
      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text("COMPROBANTE DE PAGO - CUOTA DE PRÉSTAMO", 105, yPos, {
        align: "center",
      });

      yPos += 10;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Número: ${numeroComprobante}`, 14, yPos);
      doc.text(`Fecha: ${fechaFormateada} ${horaFormateada}`, 14, yPos + 6);
      doc.text(`Tipo de pago: ${medioPago || "Efectivo"}`, 14, yPos + 12);

      yPos += 20;
      doc.line(14, yPos, 196, yPos);
      yPos += 8;

      // --- DATOS CLIENTE ---
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("DATOS DEL CLIENTE", 14, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Nombre: ${cliente.nombre || "N/A"}`, 14, yPos);
      doc.text(`Documento: ${cliente.numero_documento || "N/A"}`, 14, yPos + 6);

      yPos += 16;
      doc.line(14, yPos, 196, yPos);
      yPos += 8;

      // --- DETALLES ---
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("DETALLES DEL PAGO", 14, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Préstamo ID: ${prestamoId}`, 14, yPos);
      doc.text(`Cuota N°: ${numeroCuota}`, 14, yPos + 6);

      yPos += 16;
      doc.setLineWidth(0.5);
      doc.line(14, yPos, 196, yPos);
      yPos += 10;

      // --- TOTAL ---
      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text("TOTAL PAGADO:", 14, yPos);
      doc.text(`S/ ${monto.toFixed(2)}`, 160, yPos);

      yPos += 20;
      doc.setFontSize(9);
      doc.setFont(undefined, "italic");
      doc.text("Gracias por confiar en PRESTAPE S.A.C.", 105, yPos, {
        align: "center",
      });

      doc.save(`comprobante_pago_${prestamoId}_${numeroCuota}.pdf`);

      return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    } catch (err) {
      console.error("Error PDF:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
      });
    }
  } else {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
    });
  }
}
