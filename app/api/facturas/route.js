import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, runTransaction } from "firebase/firestore";

export async function POST(req) {
  try {
    const body = await req.json();
    const { prestamoId, numeroCuota } = body;

    if (!prestamoId || !numeroCuota) {
      return NextResponse.json(
        { error: "Faltan datos: prestamoId o numeroCuota" },
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

    const prestamoData = prestamoSnap.data();
    const cuotaData = prestamoData.cronograma.find((c) => c.num === numeroCuota);

    if (!cuotaData) {
      return NextResponse.json(
        { error: "Cuota no encontrada" },
        { status: 404 }
      );
    }

    // 2. BUSCAR EL PAGO REGISTRADO
    const pagosRef = collection(db, "pagos");
    const q = query(
      pagosRef,
      where("prestamoId", "==", prestamoId),
      where("numeroCuota", "==", numeroCuota),
      orderBy("fechaRegistro", "desc"),
      limit(1)
    );

    const pagoSnapshot = await getDocs(q);
    let medioPago = "Efectivo";
    let fechaPago = new Date();
    let montoPagado = cuotaData.amount;

    if (!pagoSnapshot.empty) {
      const pagoData = pagoSnapshot.docs[0].data();
      medioPago = pagoData.medioPago || "Efectivo";
      
      // Manejar fechaRegistro que puede ser Timestamp o string ISO
      if (pagoData.fechaRegistro) {
        if (typeof pagoData.fechaRegistro.toDate === 'function') {
          fechaPago = pagoData.fechaRegistro.toDate();
        } else {
          fechaPago = new Date(pagoData.fechaRegistro);
        }
      }
      
      montoPagado = pagoData.montoPagado || cuotaData.amount;
    }

    // 3. DATOS PARA LA FACTURA
    const clienteNombre = prestamoData.nombreCliente || "N/A";
    const clienteRuc = prestamoData.dniCliente || "N/A"; // Debe ser RUC de 11 dígitos
    
    // Generar número de factura secuencial
    const contadorRef = doc(db, "contadores", "facturas");
    let numeroFactura = "";
    
    try {
      await runTransaction(db, async (transaction) => {
        const contadorDoc = await transaction.get(contadorRef);
        let siguienteNumero = 1;
        
        if (contadorDoc.exists()) {
          siguienteNumero = (contadorDoc.data().ultimo || 0) + 1;
        }
        
        transaction.set(contadorRef, { ultimo: siguienteNumero });
        
        // Formato: E001 + número correlativo de 6 dígitos
        const correlativo = String(siguienteNumero).padStart(6, '0');
        numeroFactura = `E001-${correlativo}`;
      });
    } catch (error) {
      console.error("Error generando número de factura:", error);
      numeroFactura = `E001-${String(Math.floor(Math.random() * 900000) + 100000)}`;
    }
    
    const fechaEmision = fechaPago.toLocaleDateString("es-PE");
    const fechaVencimiento = cuotaData.dueDate
      ? new Date(cuotaData.dueDate).toLocaleDateString("es-PE")
      : "N/A";

    // 🔹 CÁLCULOS CORRECTOS: Separar Capital e Interés
    // El interés es la GANANCIA (base gravable para IGV)
    // El capital es INAFECTO (no paga IGV, es devolución)
    const interes = cuotaData.interest || 0;  // Ganancia que SÍ paga IGV (en inglés en el cronograma)
    const capital = cuotaData.capital || 0;   // Capital que NO paga IGV (inafecto)
    
    // Solo el interés lleva IGV del 18%
    const valorVentaInteres = parseFloat((interes / 1.18).toFixed(2));
    const igv = parseFloat((interes - valorVentaInteres).toFixed(2));
    const total = montoPagado;  // Total es capital + interés

    // Convertir número a texto
    const numeroATexto = (num) => {
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
        "DIEZ",
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

      const entero = Math.floor(num);
      const decimales = Math.round((num - entero) * 100);

      if (entero === 0) return "CERO Y " + decimales.toString().padStart(2, "0") + "/100 SOLES";
      if (entero === 100) return "CIEN Y " + decimales.toString().padStart(2, "0") + "/100 SOLES";

      let texto = "";

      // Miles
      const miles = Math.floor(entero / 1000);
      if (miles > 0) {
        if (miles === 1) {
          texto += "MIL ";
        } else {
          texto += numeroATexto(miles).split(" Y ")[0] + " MIL ";
        }
      }

      // Centenas
      const resto = entero % 1000;
      const cent = Math.floor(resto / 100);
      if (cent > 0) {
        if (resto === 100) {
          texto += "CIEN ";
        } else {
          texto += centenas[cent] + " ";
        }
      }

      // Decenas y unidades
      const dec = Math.floor((resto % 100) / 10);
      const uni = resto % 10;

      if (dec === 1 && uni !== 0) {
        texto += especiales[uni] + " ";
      } else {
        if (dec > 0) texto += decenas[dec] + " ";
        if (uni > 0) {
          if (dec > 0 && dec !== 2) texto += "Y ";
          texto += unidades[uni] + " ";
        }
      }

      return texto.trim() + " Y " + decimales.toString().padStart(2, "0") + "/100 SOLES";
    };

    const montoTexto = numeroATexto(total);

    // 4. GENERAR PDF
    const pdf = new jsPDF();

    // ENCABEZADO CON BORDE
    pdf.setLineWidth(0.5);
    pdf.rect(10, 10, 190, 35);

    // Columna izquierda - Datos de la empresa
    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");
    pdf.text("NOTICIERO CONTABLE", 15, 18);
    pdf.text("PRESTAPE S.A.C.", 15, 23);
    
    pdf.setFont(undefined, "normal");
    pdf.setFontSize(8);
    pdf.text("Trujillo - La Libertad - Perú", 15, 28);
    pdf.text("TEL: 999 999 999", 15, 32);
    pdf.text("Email: soporte@prestape.com", 15, 36);
    pdf.text("Web: https://final-agile.vercel.app/dashboard", 15, 40);

    // Cuadro derecho - Factura electrónica
    pdf.setLineWidth(1);
    pdf.rect(130, 15, 65, 25);
    pdf.setFontSize(11);
    pdf.setFont(undefined, "bold");
    pdf.text("FACTURA ELECTRÓNICA", 162.5, 22, { align: "center" });
    pdf.setFontSize(10);
    pdf.text("RUC: 20721834495", 162.5, 28, { align: "center" });
    pdf.text(numeroFactura, 162.5, 35, { align: "center" });

    // INFORMACIÓN PRINCIPAL
    let y = 52;
    pdf.setLineWidth(0.5);
    pdf.rect(10, y, 190, 30);

    pdf.setFontSize(9);
    pdf.setFont(undefined, "bold");
    pdf.text("Fecha de Vencimiento", 15, y + 5);
    pdf.text("Fecha de Emisión", 15, y + 10);
    pdf.text("Señor(es)", 15, y + 15);
    pdf.text("RUC", 15, y + 20);

    pdf.setFont(undefined, "normal");
    pdf.text(`: ${fechaVencimiento}`, 65, y + 5);
    pdf.text(`: ${fechaEmision}`, 65, y + 10);
    pdf.text(`: ${clienteNombre}`, 65, y + 15);
    pdf.text(`: ${clienteRuc}`, 65, y + 20);

    // Forma de pago en el lado derecho
    pdf.setLineWidth(1);
    pdf.rect(130, y + 2, 65, 8);
    pdf.setFont(undefined, "bold");
    pdf.text(`Forma de pago: ${medioPago}`, 162.5, y + 7, { align: "center" });

    // DETALLE DEL SERVICIO
    y = 88;
    pdf.setFontSize(9);
    pdf.setFont(undefined, "bold");
    pdf.text("Tipo de Moneda", 15, y);
    pdf.text("Observación", 15, y + 5);

    pdf.setFont(undefined, "normal");
    pdf.text(": SOLES", 50, y);
    
    // Detracción con recuadro
    pdf.setLineWidth(0.5);
    pdf.rect(48, y + 1, 45, 5);
    pdf.text("DETRACCIÓN (12%): S/ " + (total * 0.12).toFixed(2), 50, y + 5);

    // TABLA DE CONCEPTOS
    y = 100;
    pdf.setLineWidth(0.5);
    pdf.rect(10, y, 190, 10);
    
    // Encabezados
    pdf.setFont(undefined, "bold");
    pdf.text("Cantidad", 15, y + 6);
    pdf.text("Unidad Medida", 45, y + 6);
    pdf.text("Código", 80, y + 6);
    pdf.text("Descripción", 110, y + 6);
    pdf.text("Valor Unitario", 160, y + 6);
    pdf.text("ICBPER", 185, y + 6);

    // Línea horizontal
    pdf.line(10, y + 8, 200, y + 8);

    // 🔹 LÍNEA 1: INTERÉS (Gravado con IGV)
    y += 15;
    pdf.setFont(undefined, "normal");
    pdf.text("1.00", 15, y);
    pdf.text("UNIDAD", 45, y);
    pdf.text("INT-" + numeroCuota, 80, y);
    pdf.text(`INTERÉS FINANCIERO - CUOTA ${numeroCuota}`, 110, y);
    pdf.text(valorVentaInteres.toFixed(2), 165, y);
    pdf.text("0.00", 188, y);

    // 🔹 LÍNEA 2: CAPITAL (Inafecto - NO lleva IGV)
    y += 5;
    pdf.text("1.00", 15, y);
    pdf.text("UNIDAD", 45, y);
    pdf.text("CAP-" + numeroCuota, 80, y);
    pdf.text(`AMORTIZACIÓN CAPITAL (INAFECTO) - CUOTA ${numeroCuota}`, 110, y);
    pdf.text(capital.toFixed(2), 165, y);
    pdf.text("0.00", 188, y);

    // Línea de cierre de tabla
    y += 5;
    pdf.line(10, y, 200, y);

    // MONTO EN LETRAS
    y += 10;
    pdf.setFont(undefined, "bold");
    pdf.text("SON: " + montoTexto, 15, y);

    // TOTALES
    y += 10;
    pdf.setLineWidth(0.5);
    pdf.rect(120, y, 75, 50);

    const labels = [
      "Sub Total Ventas (Gravado) :",
      "Op. Inafectas (Capital) :",
      "Anticipos :",
      "Descuentos :",
      "Valor Venta :",
      "ISC :",
      "IGV (18%) :",
      "ICBPER :",
      "Otros Cargos :",
      "Otros Tributos :",
      "Monto de redondeo :",
      "Importe Total :",
    ];

    const valores = [
      valorVentaInteres.toFixed(2),
      capital.toFixed(2),
      "0.00",
      "0.00",
      valorVentaInteres.toFixed(2),
      "0.00",
      igv.toFixed(2),
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      total.toFixed(2),
    ];

    pdf.setFontSize(8);
    for (let i = 0; i < labels.length; i++) {
      pdf.setFont(undefined, "normal");
      pdf.text(labels[i], 125, y + 5 + i * 4);
      pdf.setFont(undefined, i === labels.length - 1 ? "bold" : "normal");
      pdf.text("S/ " + valores[i], 190, y + 5 + i * 4, { align: "right" });
    }

    // PIE DE PÁGINA
    y += 55;
    pdf.setFontSize(8);
    pdf.setFont(undefined, "italic");
    pdf.text(
      "Esta es una representación impresa de la factura electrónica, generada en el Sistema de PRESTAPE.",
      105,
      y + 5,
      { align: "center" }
    );
    pdf.text(
      "Puede verificarla utilizando el número de factura.",
      105,
      y + 10,
      { align: "center" }
    );
    pdf.setFontSize(7);
    pdf.text(
      "* El capital amortizado es una operación inafecta según Art. 1° Ley del IGV",
      105,
      y + 15,
      { align: "center" }
    );

    const pdfBuffer = pdf.output("arraybuffer");

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=factura_${numeroFactura}_${prestamoId}.pdf`,
      },
      status: 200,
    });
  } catch (err) {
    console.error("Error generando factura:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}