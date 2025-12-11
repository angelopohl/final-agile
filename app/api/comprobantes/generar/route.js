import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  setDoc,
  runTransaction,
} from "firebase/firestore";

// Función para convertir números a letras
function numeroALetras(num) {
  const unidades = [
    "",
    "UNO",
    "DOS",
    "TRES",
    "CUATRO",
    "CINCO",
    "SEIS",
    "SIETE",
    "OCHO",
    "NUEVE",
  ];
  const decenas = [
    "",
    "",
    "VEINTE",
    "TREINTA",
    "CUARENTA",
    "CINCUENTA",
    "SESENTA",
    "SETENTA",
    "OCHENTA",
    "NOVENTA",
  ];
  const especiales = [
    "DIEZ",
    "ONCE",
    "DOCE",
    "TRECE",
    "CATORCE",
    "QUINCE",
    "DIECISEIS",
    "DIECISIETE",
    "DIECIOCHO",
    "DIECINUEVE",
  ];
  const centenas = [
    "",
    "CIENTO",
    "DOSCIENTOS",
    "TRESCIENTOS",
    "CUATROCIENTOS",
    "QUINIENTOS",
    "SEISCIENTOS",
    "SETECIENTOS",
    "OCHOCIENTOS",
    "NOVECIENTOS",
  ];

  if (num === 0) return "CERO";
  if (num === 100) return "CIEN";

  let resultado = "";

  // Miles
  if (num >= 1000) {
    const miles = Math.floor(num / 1000);
    if (miles === 1) {
      resultado += "MIL ";
    } else {
      resultado += numeroALetras(miles) + " MIL ";
    }
    num %= 1000;
  }

  // Centenas
  if (num >= 100) {
    resultado += centenas[Math.floor(num / 100)] + " ";
    num %= 100;
  }

  // Decenas y unidades
  if (num >= 20) {
    resultado += decenas[Math.floor(num / 10)];
    if (num % 10 > 0) {
      resultado += " Y " + unidades[num % 10];
    }
  } else if (num >= 10) {
    resultado += especiales[num - 10];
  } else if (num > 0) {
    resultado += unidades[num];
  }

  return resultado.trim();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { prestamoId, numeroCuota, monto, cliente: clienteBody } = body;

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

    // 2. BUSCAR EL REGISTRO DE PAGO REAL
    const pagosRef = collection(db, "pagos");
    const q = query(
      pagosRef,
      where("prestamoId", "==", prestamoId),
      where("numeroCuota", "==", numeroCuota),
      orderBy("fechaRegistro", "desc"),
      limit(1)
    );

    const pagoSnapshot = await getDocs(q);
    let medioPagoReal = "Efectivo";
    let montoRecibido = 0;

    if (!pagoSnapshot.empty) {
      const pagoData = pagoSnapshot.docs[0].data();
      if (pagoData.medioPago) {
        medioPagoReal = pagoData.medioPago;
      }
      if (pagoData.montoRecibido) {
        montoRecibido = pagoData.montoRecibido;
      }
    }

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

    // Datos del cliente y préstamo
    const clienteNombre =
      prestamoData.nombreCliente || clienteBody?.nombre || "N/A";
    const clienteDni =
      prestamoData.dniCliente || clienteBody?.numero_documento || "N/A";
    const montoTotalPrestado = prestamoData.montoSolicitado || 0;
    const interesTotal = prestamoData.totalIntereses || 0;
    const totalCuotas = prestamoData.numeroCuotas || 0;

    const fechaEmision = new Date().toLocaleDateString("es-PE", {
      timeZone: "America/Lima",
    });
    const capitalPagado = cuotaData.capitalPagado || 0;
    const capitalPendiente = Math.max(0, cuotaData.amount - capitalPagado);
    const moraPagada = cuotaData.moraPagada || 0;
    const interesOriginal = cuotaData.interest || 0;

    const redondearADecima = (valor) => {
      return Math.round(valor * 10) / 10;
    };

    const interesPagado = Math.min(capitalPagado, interesOriginal); // Sin redondeo
    const amortizacionPagada = redondearADecima(
      capitalPagado - Math.min(capitalPagado, interesOriginal)
    );
    const moraPagadaRedondeada = redondearADecima(moraPagada);

    // Calcular el total según tipo de pago
    const subtotal = redondearADecima(
      interesPagado + amortizacionPagada + moraPagadaRedondeada
    );
    let totalPagado = subtotal;

    if (medioPagoReal === "EFECTIVO" || medioPagoReal === "Efectivo") {
      totalPagado = redondearADecima(subtotal);
    }

    // Generar número de comprobante secuencial
    const contadorRef = doc(db, "contadores", "comprobantes");
    let numeroComprobante = "";

    try {
      await runTransaction(db, async (transaction) => {
        const contadorDoc = await transaction.get(contadorRef);
        let siguienteNumero = 1;

        if (contadorDoc.exists()) {
          siguienteNumero = (contadorDoc.data().ultimo || 0) + 1;
        }

        // Actualizar el contador
        transaction.set(contadorRef, { ultimo: siguienteNumero });

        // Formato: F + número con 3 dígitos + guion + número correlativo de 6 dígitos
        const serie = String(siguienteNumero).padStart(3, "0");
        const correlativo = String(siguienteNumero).padStart(6, "0");
        numeroComprobante = `F${serie}-${correlativo}`;
      });
    } catch (error) {
      console.error("Error generando número de comprobante:", error);
      // Fallback en caso de error
      numeroComprobante = `F014-${String(
        Math.floor(Math.random() * 900000) + 100000
      )}`;
    }

    const numeroCreditoFormat = prestamoId;

    // --- GENERACIÓN DEL PDF ---
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "normal");

    // Logo y encabezado de la empresa (lado izquierdo)
    let y = 20;
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.text("PRESTAPE S.A.C.", 20, y);
    pdf.setTextColor(0, 0, 0);

    // Dirección (lado izquierdo)
    y += 6;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.text("RUC: 20721834495", 20, y);
    y += 4;
    pdf.text("Trujillo - Trujillo - Perú", 20, y);
    y += 4;
    pdf.text("TEL: 999 999 999", 20, y);
    y += 4;
    pdf.text("soporte@prestape.com", 20, y);

    // Cuadro RUC y Número de Comprobante (lado derecho)
    const boxX = 130;
    const boxY = 15;
    const boxWidth = 70;
    const boxHeight = 35;

    pdf.setLineWidth(0.5);
    pdf.rect(boxX, boxY, boxWidth, boxHeight);

    pdf.setFontSize(9);
    pdf.setFont(undefined, "normal");
    let textY = boxY + 7;
    pdf.text("RUC 20721834495", boxX + boxWidth / 2, textY, {
      align: "center",
    });
    textY += 6;
    pdf.text("COMPROBANTE SISTEMA FINANCIERO", boxX + boxWidth / 2, textY, {
      align: "center",
    });
    textY += 6;
    pdf.setFont(undefined, "bold");
    pdf.text(`Nro ${numeroComprobante}`, boxX + boxWidth / 2, textY, {
      align: "center",
    });

    // Línea separadora
    y = 60;
    pdf.setLineWidth(0.3);
    pdf.line(15, y, 195, y);

    // Tabla de información del cliente
    y += 8;
    const tableStartY = y;
    const col1X = 18;
    const col2X = 110;
    const rowHeight = 8;

    // Crear tabla con bordes
    pdf.setLineWidth(0.3);
    const tableHeight = rowHeight * 7;
    pdf.rect(15, tableStartY - 4, 180, tableHeight);

    // Líneas horizontales
    for (let i = 1; i <= 7; i++) {
      pdf.line(
        15,
        tableStartY - 4 + rowHeight * i,
        195,
        tableStartY - 4 + rowHeight * i
      );
    }

    // Línea vertical central
    pdf.line(105, tableStartY - 4, 105, tableStartY - 4 + tableHeight);

    // Llenar datos
    let currentY = tableStartY + 1;

    pdf.setFontSize(9);
    pdf.setFont(undefined, "normal");
    pdf.text("Señor(es)", col1X, currentY);
    pdf.setFont(undefined, "bold");
    pdf.text(clienteNombre, col2X, currentY);
    currentY += rowHeight;

    pdf.setFont(undefined, "normal");
    pdf.text("Tipo de Documento", col1X, currentY);
    pdf.setFont(undefined, "bold");
    pdf.text("DNI", col2X, currentY);
    currentY += rowHeight;

    pdf.setFont(undefined, "normal");
    pdf.text("Número de Documento", col1X, currentY);
    pdf.setFont(undefined, "bold");
    pdf.text(clienteDni, col2X, currentY);
    currentY += rowHeight;

    pdf.setFont(undefined, "normal");
    pdf.text("Fecha de Emisión", col1X, currentY);
    pdf.setFont(undefined, "bold");
    pdf.text(fechaEmision, col2X, currentY);
    currentY += rowHeight;

    pdf.setFont(undefined, "normal");
    pdf.text("Información del Crédito", col1X, currentY);
    currentY += rowHeight;

    pdf.setFont(undefined, "normal");
    pdf.text("Número del prestamo", col1X, currentY);
    pdf.setFont(undefined, "bold");
    pdf.text(numeroCreditoFormat, col2X, currentY);
    currentY += rowHeight;

    pdf.setFont(undefined, "normal");
    pdf.text("Moneda", col1X, currentY);
    pdf.setFont(undefined, "bold");
    pdf.text("SOLES", col2X, currentY);

    // Segunda tabla - Código SUNAT
    y = tableStartY + tableHeight + 5;
    const table2StartY = y;
    const table2Height = 50;
    pdf.setLineWidth(0.3);
    pdf.rect(15, y, 180, table2Height);

    // Headers de la tabla - línea horizontal después de headers
    const headerHeight = 8;
    pdf.line(15, y + headerHeight, 195, y + headerHeight);

    // Líneas verticales
    const col1Width = 50; // CÓDIGO DE PRODUCTO SUNAT - más estrecha
    const col2Width = 75; // DESCRIPCIÓN - más ancha
    // El resto es MONTO OPERACIÓN

    pdf.line(15 + col1Width, y, 15 + col1Width, y + table2Height);
    pdf.line(
      15 + col1Width + col2Width,
      y,
      15 + col1Width + col2Width,
      y + table2Height
    );

    pdf.setFontSize(9);
    pdf.setFont(undefined, "bold");
    pdf.text("CÓDIGO DE", 18, y + 4);
    pdf.text("PRODUCTO SUNAT", 18, y + 7);
    pdf.text("DESCRIPCIÓN", 15 + col1Width + 3, y + 5);
    pdf.text("MONTO OPERACIÓN", 15 + col1Width + col2Width + 10, y + 5);

    // Datos del producto
    let dataY = y + headerHeight + 5;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.text("2100", 18, dataY);

    // Columna DESCRIPCIÓN - todos los campos ordenados
    const descripcionX = 15 + col1Width + 3;
    const montoColX = 15 + col1Width + col2Width;
    const montoColWidth = 180 - col1Width - col2Width;

    let lineY = dataY;

    // 1. Interes de Créditos compensatorios
    pdf.text("Interes de Créditos compensatorios", descripcionX, lineY);
    pdf.text("S/", montoColX + montoColWidth - 20, lineY);
    pdf.text(interesPagado.toFixed(2), montoColX + montoColWidth - 5, lineY, {
      align: "right",
    });
    lineY += 5;

    // 2. Descuentos
    pdf.text("Descuentos", descripcionX, lineY);
    pdf.text("S/", montoColX + montoColWidth - 20, lineY);
    pdf.text("0", montoColX + montoColWidth - 5, lineY, { align: "right" });
    lineY += 5;

    // 3. Cargos (MORA)
    pdf.text("Cargos", descripcionX, lineY);
    pdf.text("S/", montoColX + montoColWidth - 20, lineY);
    pdf.text(
      moraPagadaRedondeada.toFixed(2),
      montoColX + montoColWidth - 5,
      lineY,
      { align: "right" }
    );
    lineY += 5;

    // 4. Valor de ventas operaciones exoneradas
    pdf.text("Valor de ventas operaciones exoneradas", descripcionX, lineY);
    pdf.text("S/", montoColX + montoColWidth - 20, lineY);
    pdf.text("0.00", montoColX + montoColWidth - 5, lineY, { align: "right" });
    lineY += 5;

    // 5. Valor de ventas operaciones inafectas
    pdf.text("Valor de ventas operaciones inafectas", descripcionX, lineY);
    pdf.text("S/", montoColX + montoColWidth - 20, lineY);
    pdf.text(totalPagado.toFixed(2), montoColX + montoColWidth - 5, lineY, {
      align: "right",
    });
    lineY += 5;

    // 6. Importe Total
    pdf.setFont(undefined, "bold");
    pdf.text("Importe Total", descripcionX, lineY);
    pdf.text("S/", montoColX + montoColWidth - 20, lineY);
    pdf.text(totalPagado.toFixed(2), montoColX + montoColWidth - 5, lineY, {
      align: "right",
    });
    pdf.setFont(undefined, "normal");

    // SON: Monto en letras
    y = table2StartY + table2Height + 5;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "bold");

    const parteEntera = Math.floor(totalPagado);
    const parteDecimal = Math.round((totalPagado - parteEntera) * 100);
    const montoEnLetras = `${numeroALetras(parteEntera)} CON ${String(
      parteDecimal
    ).padStart(2, "0")}/100 SOLES`;

    pdf.text("SON:", 15, y);
    pdf.setFont(undefined, "normal");
    pdf.text(montoEnLetras, 30, y);

    // Nota de validación
    y += 7;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "italic");
    const validationUrl = "https://final-agile.vercel.app/dashboard";
    pdf.text(`Este documento puede ser válido en ${validationUrl}`, 105, y, {
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
