import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { consultarDniReniec } from "@/services/reniecService";
import { consultarRucSunat } from "@/services/sunatService";

export async function POST(request) {
  try {
    const body = await request.json();
    const documento = body.dni || body.documento;

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
      return NextResponse.json(clienteSnap.data());
    }

    // 2. CONSULTAR API EXTERNA
    let datosExternos = null;
    let tipoDoc = "DNI";

    console.log(
      `🔍 Consultando ${documento.length === 8 ? "DNI" : "RUC"}: ${documento}`
    );

    if (documento.length === 8) {
      tipoDoc = "DNI";
      datosExternos = await consultarDniReniec(documento);
    } else if (documento.length === 11) {
      tipoDoc = "RUC";
      datosExternos = await consultarRucSunat(documento);
    }

    if (!datosExternos) {
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

      // CORRECCIÓN 1: Agregamos paréntesis ()
      fechaRegistro: serverTimestamp(),

      estado: "ACTIVO",
    };

    await setDoc(clienteRef, nuevoCliente);

    // CORRECCIÓN 2: Devolvemos una fecha real al frontend
    // Esto es necesario porque serverTimestamp() no se puede leer inmediatamente en el JSON
    return NextResponse.json({
      ...nuevoCliente,
      fechaRegistro: new Date().toISOString(), // Simulamos la fecha para que el frontend no falle
    });
  } catch (error) {
    console.error("🔴 Error API Verificar:", error);
    return NextResponse.json(
      { message: "Error interno", error: error.message },
      { status: 500 }
    );
  }
}
