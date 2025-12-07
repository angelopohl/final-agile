// app/api/comprobantes/generar.js

import { jsPDF } from "jspdf"; // Importar jsPDF

export async function POST(req) {
  if (req.method === "POST") {
    try {
      // Obtiene los datos de la solicitud
      const { prestamoId, numeroCuota, monto, medioPago, cliente, productos } =
        await req.json();

      // Verifica que los datos esenciales estén presentes
      if (!prestamoId || !numeroCuota || !monto || !cliente) {
        return new Response(
          JSON.stringify({
            error: "Faltan datos para generar el comprobante.",
          }),
          { status: 400 }
        );
      }

      // Crea el documento PDF
      const doc = new jsPDF();

      // Encabezado
      doc.setFontSize(18);
      doc.text("Comprobante de Pago", 14, 20);

      doc.setFontSize(12);
      doc.text("Emisor: Confecciones Darkys", 14, 30);
      doc.text("RUC: 12345678901", 14, 40);
      doc.text("Dirección: Av. Ejemplo 123", 14, 50);

      // Cliente
      doc.text(`Cliente: ${cliente.nombre}`, 14, 60);
      doc.text(`Documento: ${cliente.numero_documento}`, 14, 70);
      doc.text(`Dirección: ${cliente.direccion}`, 14, 80);

      // Detalles del préstamo
      doc.text(`Préstamo ID: ${prestamoId}`, 14, 90);
      doc.text(`Número de cuota: ${numeroCuota}`, 14, 100);

      // Detalle de la transacción
      doc.text("Descripción:", 14, 110);
      doc.text(`Cuota ${numeroCuota} - Monto: S/ ${monto.toFixed(2)}`, 14, 120);

      // Método de pago
      doc.text(`Método de pago: ${medioPago}`, 14, 130);

      // Total
      doc.setFontSize(14);
      doc.text(`Total a pagar: S/ ${monto.toFixed(2)}`, 14, 140);

      // Pie de página
      doc.text("Gracias por tu pago.", 14, 150);
      doc.text("www.confeccionesdarkys.com", 14, 160);

      // Guardar el archivo PDF
      doc.save(`comprobante_pago_${prestamoId}_${numeroCuota}.pdf`);

      // Responder con un éxito
      return new Response(
        JSON.stringify({ message: "Comprobante generado exitosamente." }),
        { status: 200 }
      );
    } catch (err) {
      console.error("Error al generar el comprobante:", err);
      return new Response(
        JSON.stringify({ error: err.message || "Error de servidor" }),
        { status: 500 }
      );
    }
  } else {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
    });
  }
}
