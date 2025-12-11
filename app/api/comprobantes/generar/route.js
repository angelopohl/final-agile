import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { db } from "@/lib/firebase";
import {
  doc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  limit,
} from "firebase/firestore";

// --- FUNCIÓN AUXILIAR: NUMERO A LETRAS ---
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

  if (num >= 1000) {
    const miles = Math.floor(num / 1000);
    if (miles === 1) resultado += "MIL ";
    else resultado += numeroALetras(miles) + " MIL ";
    num %= 1000;
  }
  if (num >= 100) {
    resultado += centenas[Math.floor(num / 100)] + " ";
    num %= 100;
  }
  if (num >= 20) {
    resultado += decenas[Math.floor(num / 10)];
    if (num % 10 > 0) resultado += " Y " + unidades[num % 10];
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
    let { prestamoId, numeroCuota, monto, cliente: clienteBody } = body;

    if (!prestamoId || !numeroCuota) {
      return NextResponse.json(
        { error: "Faltan datos ID o Cuota." },
        { status: 400 }
      );
    }

    const cuotaNumero = Number(numeroCuota);
    console.log(
      `🔍 Generando FACTURA - ID: ${prestamoId}, Cuota: ${cuotaNumero}`
    );

    // 1. BUSCAR EL DOCUMENTO DE PAGO
    const pagosRef = collection(db, "pagos");
    const q = query(
      pagosRef,
      where("prestamoId", "==", prestamoId),
      where("numeroCuota", "==", cuotaNumero),
      limit(1)
    );

    const pagoSnapshot = await getDocs(q);

    if (pagoSnapshot.empty) {
      return NextResponse.json(
        {
          error:
            "No se encontró el pago. Asegúrate de que el pago esté registrado.",
        },
        { status: 404 }
      );
    }

    const pagoDoc = pagoSnapshot.docs[0];
    const pagoDocRef = pagoDoc.ref;

    // 2. REFERENCIAS
    const prestamoRef = doc(db, "prestamos", prestamoId);
    const contadorRef = doc(db, "contadores", "comprobantes");

    // 3. TRANSACCIÓN ROBUSTA (Con SET MERGE para forzar guardado)
    let resultPDF = null;

    await runTransaction(db, async (transaction) => {
      const prestamoSnap = await transaction.get(prestamoRef);
      const pagoSnap = await transaction.get(pagoDocRef);

      if (!prestamoSnap.exists()) throw new Error("Préstamo no encontrado");
      if (!pagoSnap.exists())
        throw new Error("Pago no encontrado (desapareció)");

      const prestamoData = prestamoSnap.data();
      const pagoData = pagoSnap.data();

      // Buscar cuota
      const cronograma = prestamoData.cronograma || [];
      const indexCuota = cronograma.findIndex((c) => c.num === cuotaNumero);
      if (indexCuota === -1)
        throw new Error("Cuota no encontrada en cronograma");

      const cuotaData = cronograma[indexCuota];

      // --- LÓGICA DE NÚMERO ---
      // Revisamos si YA existe en el pago o en la cuota
      let numeroComprobante =
        pagoData.numeroComprobante || cuotaData.numeroComprobante || null;

      if (numeroComprobante) {
        console.log("♻️ Factura YA EXISTE:", numeroComprobante);
        // Sincronización defensiva: Si falta en el pago, lo ponemos a la fuerza
        if (!pagoData.numeroComprobante) {
          transaction.set(pagoDocRef, { numeroComprobante }, { merge: true });
        }
      } else {
        // GENERAR NUEVO
        const contadorSnap = await transaction.get(contadorRef);
        let siguienteNumero = 1;
        if (contadorSnap.exists()) {
          siguienteNumero = (contadorSnap.data().ultimo || 0) + 1;
        }

        const serie = String(siguienteNumero).padStart(3, "0");
        const correlativo = String(siguienteNumero).padStart(6, "0");
        numeroComprobante = `F${serie}-${correlativo}`;

        console.log("🆕 Creando NUEVA Factura:", numeroComprobante);

        // --- GUARDADO CRÍTICO ---
        // 1. Contador
        transaction.set(contadorRef, { ultimo: siguienteNumero });

        // 2. Pago (Factura) - USAMOS SET MERGE (La solución clave)
        // Esto asegura que se escriba el campo sí o sí, sin fallar si el doc es "nuevo"
        transaction.set(
          pagoDocRef,
          { numeroComprobante: numeroComprobante },
          { merge: true }
        );

        // 3. Préstamo (Cronograma)
        cronograma[indexCuota].numeroComprobante = numeroComprobante;
        transaction.update(prestamoRef, { cronograma });
      }

      // Preparar datos PDF
      const clienteNombre =
        prestamoData.nombreCliente || clienteBody?.nombre || "N/A";
      const clienteDni =
        prestamoData.dniCliente || clienteBody?.numero_documento || "N/A";
      const fechaEmision = new Date().toLocaleDateString("es-PE", {
        timeZone: "America/Lima",
      });
      const numeroCreditoFormat = prestamoId;

      const capitalPagado = cuotaData.capitalPagado || 0;
      const moraPagada = cuotaData.moraPagada || 0;
      const interesOriginal = cuotaData.interest || 0;
      const redondearADecima = (valor) => Math.round(valor * 10) / 10;

      const interesPagado = Math.min(capitalPagado, interesOriginal);
      const amortizacionPagada = redondearADecima(
        capitalPagado - Math.min(capitalPagado, interesOriginal)
      );
      const moraPagadaRedondeada = redondearADecima(moraPagada);

      let subtotal = redondearADecima(
        interesPagado + amortizacionPagada + moraPagadaRedondeada
      );
      let totalPagado = subtotal;

      // Respetar monto real pagado si existe
      if (pagoData.montoRecibido) {
        // Lógica opcional si quieres usar el monto exacto del recibo
      }
      if (
        pagoData.medioPago === "EFECTIVO" ||
        pagoData.medioPago === "Efectivo"
      ) {
        totalPagado = redondearADecima(subtotal);
      }

      resultPDF = {
        clienteNombre,
        clienteDni,
        fechaEmision,
        numeroCreditoFormat,
        interesPagado,
        moraPagadaRedondeada,
        totalPagado,
        numeroComprobante,
        subtotal,
      };
    });

    // --- GENERAR PDF ---
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "normal");

    let y = 20;
    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.text("PRESTAPE S.A.C.", 20, y);
    pdf.setTextColor(0, 0, 0);

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
    pdf.text(`Nro ${resultPDF.numeroComprobante}`, boxX + boxWidth / 2, textY, {
      align: "center",
    });

    y = 60;
    pdf.setLineWidth(0.3);
    pdf.line(15, y, 195, y);

    y += 8;
    const tableStartY = y;
    const col1X = 18;
    const col2X = 110;
    const rowHeight = 8;
    const tableHeight = rowHeight * 7;

    pdf.rect(15, tableStartY - 4, 180, tableHeight);

    for (let i = 1; i <= 7; i++) {
      pdf.line(
        15,
        tableStartY - 4 + rowHeight * i,
        195,
        tableStartY - 4 + rowHeight * i
      );
    }
    pdf.line(105, tableStartY - 4, 105, tableStartY - 4 + tableHeight);

    let currentY = tableStartY + 1;
    pdf.setFontSize(9);

    const drawRow = (label, value) => {
      pdf.setFont(undefined, "normal");
      pdf.text(label, col1X, currentY);
      pdf.setFont(undefined, "bold");
      pdf.text(value, col2X, currentY);
      currentY += rowHeight;
    };

    drawRow("Señor(es)", resultPDF.clienteNombre);
    const tipoDocLabel = resultPDF.clienteDni.length === 11 ? "RUC" : "DNI";
    drawRow("Tipo de Documento", tipoDocLabel);
    drawRow("Número de Documento", resultPDF.clienteDni);
    drawRow("Fecha de Emisión", resultPDF.fechaEmision);
    drawRow("Información del Crédito", "");
    drawRow("Número del prestamo", resultPDF.numeroCreditoFormat);
    drawRow("Moneda", "SOLES");

    y = tableStartY + tableHeight + 5;
    const table2StartY = y;
    const table2Height = 50;
    pdf.setLineWidth(0.3);
    pdf.rect(15, y, 180, table2Height);

    const headerHeight = 8;
    pdf.line(15, y + headerHeight, 195, y + headerHeight);

    const col1Width = 50;
    const col2Width = 75;

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

    let dataY = y + headerHeight + 5;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.text("2100", 18, dataY);

    const descripcionX = 15 + col1Width + 3;
    const montoColX = 15 + col1Width + col2Width;
    const montoColWidth = 180 - col1Width - col2Width;
    let lineY = dataY;

    const drawAmountRow = (desc, amount, bold = false) => {
      pdf.setFont(undefined, bold ? "bold" : "normal");
      pdf.text(desc, descripcionX, lineY);
      pdf.text("S/", montoColX + montoColWidth - 20, lineY);
      pdf.text(amount, montoColX + montoColWidth - 5, lineY, {
        align: "right",
      });
      lineY += 5;
    };

    drawAmountRow(
      "Interes de Créditos compensatorios",
      resultPDF.interesPagado.toFixed(2)
    );
    drawAmountRow("Descuentos", "0");
    drawAmountRow("Cargos", resultPDF.moraPagadaRedondeada.toFixed(2));
    drawAmountRow("Valor de ventas operaciones exoneradas", "0.00");
    drawAmountRow(
      "Valor de ventas operaciones inafectas",
      resultPDF.totalPagado.toFixed(2)
    );
    drawAmountRow("Importe Total", resultPDF.totalPagado.toFixed(2), true);

    y = table2StartY + table2Height + 5;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "bold");

    const parteEntera = Math.floor(resultPDF.totalPagado);
    const parteDecimal = Math.round(
      (resultPDF.totalPagado - parteEntera) * 100
    );
    const montoEnLetras = `${numeroALetras(parteEntera)} CON ${String(
      parteDecimal
    ).padStart(2, "0")}/100 SOLES`;

    pdf.text("SON:", 15, y);
    pdf.setFont(undefined, "normal");
    pdf.text(montoEnLetras, 30, y);

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
        "Content-Disposition": `attachment; filename=factura_${prestamoId}_${numeroCuota}.pdf`,
      },
      status: 200,
    });
  } catch (err) {
    console.error("Error generando PDF:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
