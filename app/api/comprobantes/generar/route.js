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
  updateDoc, // Importante: para guardar el número en el pago existente
  runTransaction,
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

// --- API ROUTE ---
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

    // Variables para controlar el número de comprobante
    let numeroComprobante = null;
    let pagoDocRef = null;

    if (!pagoSnapshot.empty) {
      const pagoDoc = pagoSnapshot.docs[0];
      const pagoData = pagoDoc.data();
      pagoDocRef = pagoDoc.ref; // Guardamos la referencia para actualizar luego

      if (pagoData.medioPago) medioPagoReal = pagoData.medioPago;
      if (pagoData.montoRecibido) montoRecibido = pagoData.montoRecibido;

      // SI YA TIENE NÚMERO, LO RECUPERAMOS
      if (pagoData.numeroComprobante) {
        numeroComprobante = pagoData.numeroComprobante;
        console.log("♻️ Usando comprobante existente:", numeroComprobante);
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

    // 3. PREPARAR DATOS PARA EL PDF
    const clienteNombre =
      prestamoData.nombreCliente || clienteBody?.nombre || "N/A";
    const clienteDni =
      prestamoData.dniCliente || clienteBody?.numero_documento || "N/A";

    // Hora Perú corregida
    const fechaEmision = new Date().toLocaleDateString("es-PE", {
      timeZone: "America/Lima",
    });

    const capitalPagado = cuotaData.capitalPagado || 0;
    const moraPagada = cuotaData.moraPagada || 0;
    const interesOriginal = cuotaData.interest || 0;

    const redondearADecima = (valor) => Math.round(valor * 10) / 10;

    const interesPagado = Math.min(capitalPagado, interesOriginal);
    const amortizacionPagada = redondearADecima(
      capitalPagado - Math.min(capitalPagado, interesOriginal)
    );
    const moraPagadaRedondeada = redondearADecima(moraPagada);

    const subtotal = redondearADecima(
      interesPagado + amortizacionPagada + moraPagadaRedondeada
    );
    let totalPagado = subtotal;

    if (medioPagoReal === "EFECTIVO" || medioPagoReal === "Efectivo") {
      totalPagado = redondearADecima(subtotal);
    }

    // 4. GENERAR O RECUPERAR NÚMERO DE COMPROBANTE (Lógica Clave)
    if (!numeroComprobante) {
      console.log("🆕 Generando NUEVO número de comprobante...");
      const contadorRef = doc(db, "contadores", "comprobantes");

      try {
        await runTransaction(db, async (transaction) => {
          const contadorDoc = await transaction.get(contadorRef);
          let siguienteNumero = 1;

          if (contadorDoc.exists()) {
            siguienteNumero = (contadorDoc.data().ultimo || 0) + 1;
          }

          // Actualizar contador global
          transaction.set(contadorRef, { ultimo: siguienteNumero });

          // Formatear
          const serie = String(siguienteNumero).padStart(3, "0");
          const correlativo = String(siguienteNumero).padStart(6, "0");
          numeroComprobante = `F${serie}-${correlativo}`;

          // Si existe el pago, guardamos este número para siempre
          if (pagoDocRef) {
            transaction.update(pagoDocRef, {
              numeroComprobante: numeroComprobante,
            });
          }
        });
      } catch (error) {
        console.error("Error generando número:", error);
        numeroComprobante = `F014-${String(
          Math.floor(Math.random() * 900000)
        )}`;
      }
    }

    const numeroCreditoFormat = prestamoId;

    // --- 5. DIBUJO DEL PDF (Aquí estaba el problema de "blanco") ---
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "normal");

    // Logo y encabezado
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

    // Cuadro RUC y Número
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
    // AQUÍ USAMOS EL NÚMERO YA CALCULADO O RECUPERADO
    pdf.text(`Nro ${numeroComprobante}`, boxX + boxWidth / 2, textY, {
      align: "center",
    });

    // Línea separadora
    y = 60;
    pdf.setLineWidth(0.3);
    pdf.line(15, y, 195, y);

    // Tabla Cliente
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

    // Filas Tabla Cliente
    const drawRow = (label, value) => {
      pdf.setFont(undefined, "normal");
      pdf.text(label, col1X, currentY);
      pdf.setFont(undefined, "bold");
      pdf.text(value, col2X, currentY);
      currentY += rowHeight;
    };

    drawRow("Señor(es)", clienteNombre);
    drawRow("Tipo de Documento", "DNI"); // Podrías hacerlo dinámico si tienes el dato
    drawRow("Número de Documento", clienteDni);
    drawRow("Fecha de Emisión", fechaEmision);
    drawRow("Información del Crédito", ""); // Título intermedio
    drawRow("Número del prestamo", numeroCreditoFormat);
    drawRow("Moneda", "SOLES");

    // Tabla Detalle (Segunda tabla)
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

    // Headers Tabla 2
    pdf.setFontSize(9);
    pdf.setFont(undefined, "bold");
    pdf.text("CÓDIGO DE", 18, y + 4);
    pdf.text("PRODUCTO SUNAT", 18, y + 7);
    pdf.text("DESCRIPCIÓN", 15 + col1Width + 3, y + 5);
    pdf.text("MONTO OPERACIÓN", 15 + col1Width + col2Width + 10, y + 5);

    // Datos Tabla 2
    let dataY = y + headerHeight + 5;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    pdf.text("2100", 18, dataY);

    const descripcionX = 15 + col1Width + 3;
    const montoColX = 15 + col1Width + col2Width;
    const montoColWidth = 180 - col1Width - col2Width;
    let lineY = dataY;

    // Función helper para filas de montos
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
      interesPagado.toFixed(2)
    );
    drawAmountRow("Descuentos", "0");
    drawAmountRow("Cargos", moraPagadaRedondeada.toFixed(2));
    drawAmountRow("Valor de ventas operaciones exoneradas", "0.00");
    drawAmountRow(
      "Valor de ventas operaciones inafectas",
      totalPagado.toFixed(2)
    );
    drawAmountRow("Importe Total", totalPagado.toFixed(2), true);

    // Monto en Letras
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

    // Footer
    y += 7;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "italic");
    const validationUrl = "https://final-agile.vercel.app/dashboard";
    pdf.text(`Este documento puede ser válido en ${validationUrl}`, 105, y, {
      align: "center",
    });

    // Output
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
