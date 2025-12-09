import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { db } from "@/lib/firebase";
// AGREGAMOS: collection, query, where, orderBy, limit, getDocs
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      prestamoId,
      numeroCuota,
      monto,
      // medioPago,  <-- YA NO CONFIAREMOS EN ESTE DATO QUE VIENE DEL FRONT
      cliente: clienteBody,
    } = body;

    if (!prestamoId || !numeroCuota) {
      return NextResponse.json(
        { error: "Faltan datos ID o Cuota." },
        { status: 400 }
      );
    }

    // 1. OBTENER DATOS DEL PRÉSTAMO
    const prestamoRef = doc(db, "prestamos", prestamoId);
    const prestamoSnap = await getDoc(prestamoRef);

    if (!prestamoSnap.exists()) {
      return NextResponse.json(
        { error: "Préstamo no encontrado" },
        { status: 404 }
      );
    }

    // 2. BUSCAR EL REGISTRO DE PAGO REAL (NUEVA LÓGICA)
    // Buscamos en la colección 'pagos' el pago correspondiente a este préstamo y cuota
    // Ordenamos por fechaRegistro desc para obtener el último intento válido
    const pagosRef = collection(db, "pagos");
    const q = query(
      pagosRef,
      where("prestamoId", "==", prestamoId),
      where("numeroCuota", "==", numeroCuota),
      orderBy("fechaRegistro", "desc"),
      limit(1)
    );

    const pagoSnapshot = await getDocs(q);
    let medioPagoReal = "Efectivo"; // Valor por defecto

    if (!pagoSnapshot.empty) {
      const pagoData = pagoSnapshot.docs[0].data();
      // Aquí recuperamos "FLOW" o lo que hayas guardado en tu ruta de pagos
      if (pagoData.medioPago) {
        medioPagoReal = pagoData.medioPago;
      }
    }

    // --- EL RESTO DE TU LÓGICA SIGUE IGUAL ---

    const prestamoData = prestamoSnap.data();
    const cuotaData = prestamoData.cronograma.find(
      (c) => c.num === numeroCuota
    );

    if (!cuotaData) {
      return NextResponse.json(
        { error: "Cuota no encontrada" },
        { status: 404 }
      );
    }

    // Datos combinados
    const clienteNombre =
      prestamoData.nombreCliente || clienteBody?.nombre || "N/A";
    const clienteDni =
      prestamoData.dniCliente || clienteBody?.numero_documento || "N/A";
    const montoTotalPrestado = prestamoData.montoSolicitado || 0;
    const interesTotal = prestamoData.totalIntereses || 0;
    const totalCuotas = prestamoData.numeroCuotas || 0;

    // Datos de la cuota
    const fechaVencimiento = cuotaData.dueDate
      ? new Date(cuotaData.dueDate).toLocaleDateString()
      : "N/A";
    const capitalPagado = cuotaData.capitalPagado || 0;
    const capitalPendiente = Math.max(0, cuotaData.amount - capitalPagado);

    // --- GENERACIÓN DEL PDF ---
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "normal");

    // -- ENCABEZADO --
    let y = 20;
    pdf.setFontSize(18);
    pdf.setFont(undefined, "bold");
    pdf.text("PRESTAPE S.A.C.", 105, y, { align: "center" });

    y += 7;
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text("RUC: 20721834495", 105, y, { align: "center" });
    y += 5;
    pdf.text("DIRECCIÓN FISCAL: Trujillo - Trujillo - Perú", 105, y, {
      align: "center",
    });
    y += 5;
    pdf.text("TEL: 999 999 999  Correo: soporte@prestape.com", 105, y, {
      align: "center",
    });
    y += 5;
    pdf.text("Web: https://final-agile.vercel.app/dashboard", 105, y, {
      align: "center",
    });

    y += 10;
    pdf.setLineWidth(0.5);
    pdf.line(10, y, 200, y);

    // -- TÍTULO DEL COMPROBANTE --
    y += 10;
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.text("COMPROBANTE DE PAGO - CUOTA DE PRÉSTAMO", 105, y, {
      align: "center",
    });

    // -- INFO GENERAL --
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");

    const codigoRecibo = `REC-${prestamoId.slice(0, 4).toUpperCase()}-${String(
      numeroCuota
    ).padStart(3, "0")}`;
    const fechaEmision = new Date().toLocaleString();

    pdf.text(`Código: ${codigoRecibo}`, 14, y);
    pdf.text(`Fecha Emisión: ${fechaEmision}`, 120, y);

    y += 6;
    pdf.text(`Moneda: Soles (PEN)`, 14, y);

    // USAMOS LA VARIABLE QUE OBTUVIMOS DE LA BD
    pdf.text(`Tipo de Pago: ${medioPagoReal}`, 120, y);

    y += 8;
    pdf.setFont(undefined, "normal");
    pdf.line(10, y, 200, y);

    // ... (El resto del código de impresión de datos del cliente y detalles se mantiene idéntico) ...
    // Solo resumí esta parte para no copiar todo de nuevo, pero debes mantener tu lógica de pintado

    y += 8;
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.text("DATOS DEL CLIENTE", 14, y);
    y += 6;
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text("Nombre:", 14, y);
    pdf.text(clienteNombre, 60, y);
    y += 5;
    pdf.text("DNI:", 14, y);
    pdf.text(clienteDni, 60, y);
    y += 5;
    pdf.text("Préstamo ID:", 14, y);
    pdf.text(prestamoId, 60, y);
    y += 8;
    pdf.line(10, y, 200, y);

    // Detalles prestamo
    y += 8;
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.text("DETALLES DEL PRÉSTAMO", 14, y);
    y += 6;
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text("Monto Total Prestado:", 14, y);
    pdf.text(`S/ ${montoTotalPrestado.toFixed(2)}`, 70, y);
    y += 5;
    pdf.text("Interés Total:", 14, y);
    pdf.text(`S/ ${interesTotal.toFixed(2)}`, 70, y);
    y += 5;
    pdf.text("Total Cuotas:", 14, y);
    pdf.text(String(totalCuotas), 70, y);
    y += 8;
    pdf.line(10, y, 200, y);

    // Detalles cuota
    y += 8;
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.text("DETALLES DE LA CUOTA", 14, y);
    y += 6;
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.text("Número de Cuota:", 14, y);
    pdf.text(String(numeroCuota), 70, y);
    y += 5;
    pdf.text("Fecha Vencimiento:", 14, y);
    pdf.text(fechaVencimiento, 70, y);
    y += 5;
    pdf.text("Capital Pendiente (Cuota):", 14, y);
    pdf.text(`S/ ${capitalPendiente.toFixed(2)}`, 70, y);
    y += 8;
    pdf.setLineWidth(0.5);
    pdf.line(10, y, 200, y);

    // Totales
    y += 10;
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.text("TOTAL PAGADO:", 14, y);
    pdf.text(`S/ ${Number(monto).toFixed(2)}`, 160, y, { align: "right" });

    y += 10;
    pdf.setFontSize(10);
    if (capitalPendiente < 0.1) {
      pdf.setTextColor(0, 128, 0);
      pdf.text("¡CUOTA CANCELADA COMPLETAMENTE!", 105, y, { align: "center" });
    } else {
      pdf.setTextColor(200, 150, 0);
      pdf.text("PAGO PARCIAL - SALDO PENDIENTE", 105, y, { align: "center" });
    }
    pdf.setTextColor(0, 0, 0);

    y += 20;
    pdf.setFontSize(9);
    pdf.setFont(undefined, "italic");
    pdf.text("Gracias por confiar en PRESTAPE S.A.C.", 105, y, {
      align: "center",
    });
    y += 5;
    pdf.setFont(undefined, "normal");
    pdf.text("Este comprobante es válido como constancia de pago.", 105, y, {
      align: "center",
    });

    const pdfBuffer = pdf.output("arraybuffer");

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
