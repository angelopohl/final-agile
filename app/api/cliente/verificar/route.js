import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { consultarDniReniec } from "@/services/reniecService";
import { consultarRucSunat } from "@/services/sunatService";

export async function POST(request) {
  try {
    const body = await request.json();
    const documento = body.dni || body.documento;

    // Validación estricta de longitud
    if (!documento || (documento.length !== 8 && documento.length !== 11)) {
      return NextResponse.json(
        { message: "El documento debe tener 8 (DNI) o 11 (RUC) dígitos" },
        { status: 400 }
      );
    }

    // 1. BUSCAR EN FIREBASE (CACHÉ)
    const clienteRef = doc(db, "clientes", documento);
    const clienteSnap = await getDoc(clienteRef);

    if (clienteSnap.exists()) {
      // Si ya existe, devolvemos lo que hay (sea correcto o antiguo)
      return NextResponse.json(clienteSnap.data());
    }

    // 2. CONSULTAR API EXTERNA (SI NO ESTÁ EN BD)
    let datosExternos = null;
    let tipoDoc = "DNI";

    console.log(`🔍 Consultando ${documento.length === 8 ? 'DNI' : 'RUC'}: ${documento}`);

    if (documento.length === 8) {
      tipoDoc = "DNI";
      datosExternos = await consultarDniReniec(documento);
      console.log("📋 Datos externos RENIEC:", datosExternos);
    } else if (documento.length === 11) {
      tipoDoc = "RUC";
      datosExternos = await consultarRucSunat(documento);
      console.log("📋 Datos externos SUNAT:", datosExternos);
    }

    // Si no se encuentra nada real, devolvemos error 404
    if (!datosExternos) {
      console.error(`❌ No se encontraron datos para ${tipoDoc}: ${documento}`);
      return NextResponse.json(
        { message: `Documento (${tipoDoc}) no encontrado en padrón oficial` },
        { status: 404 }
      );
    }
    
    console.log("✅ Datos encontrados, procediendo a guardar...");

    // 3. GUARDAR EN FIREBASE
    const nuevoCliente = {
      dni: documento,
      tipoDocumento: tipoDoc,
      nombres: datosExternos.nombres,
      apellidoPaterno: datosExternos.apellidoPaterno,
      apellidoMaterno: datosExternos.apellidoMaterno,
      direccion: datosExternos.direccion,
      estadoContribuyente: datosExternos.estadoContribuyente || "ACTIVO",
      condicionContribuyente: datosExternos.condicionContribuyente || "HABIDO",
      pep: false,
      fechaRegistro: new Date().toISOString(),
      estado: "ACTIVO",
    };

    await setDoc(clienteRef, nuevoCliente);

    return NextResponse.json(nuevoCliente);
  } catch (error) {
    console.error("🔴 Error API Verificar:", error);
    return NextResponse.json(
      { message: "Error interno", error: error.message },
      { status: 500 }
    );
  }
}
