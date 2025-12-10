import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
// IMPORTANTE: Importar el servicio de SUNAT
import { consultarDniReniec } from "@/services/reniecService";
import { consultarRucSunat } from "@/services/sunatService";

export async function POST(request) {
  try {
    const body = await request.json();
    const documento = body.dni || body.documento;

    // 1. Validación básica
    if (!documento || (documento.length !== 8 && documento.length !== 11)) {
      return NextResponse.json(
        { message: "El documento debe tener 8 (DNI) o 11 (RUC) dígitos" },
        { status: 400 }
      );
    }

    // 2. Buscar en Caché (Firebase)
    const clienteRef = doc(db, "clientes", documento);
    const clienteSnap = await getDoc(clienteRef);

    if (clienteSnap.exists()) {
      return NextResponse.json(clienteSnap.data());
    }

    // 3. Consultar API Externa (RENIEC o SUNAT)
    let datosExternos = null;
    let tipoDoc = "DNI";

    if (documento.length === 8) {
      // --- DNI (RENIEC) ---
      tipoDoc = "DNI";
      datosExternos = await consultarDniReniec(documento);
    } else if (documento.length === 11) {
      // --- RUC (SUNAT) ---
      tipoDoc = "RUC";
      // AQUÍ ESTABA EL ERROR: Antes había un código falso, ahora llamamos al servicio real
      datosExternos = await consultarRucSunat(documento);
    }

    if (!datosExternos) {
      return NextResponse.json(
        { message: `Documento (${tipoDoc}) no encontrado en padrón oficial` },
        { status: 404 }
      );
    }

    // 4. Guardar en Firestore
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
