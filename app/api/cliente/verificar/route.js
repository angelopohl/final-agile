// app/api/cliente/verificar/route.js
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { consultarDniReniec } from "@/services/reniecService";

export async function POST(request) {
  try {
    const body = await request.json();
    const { dni } = body;

    // 1. Validación básica
    if (!dni || dni.length !== 8) {
      return NextResponse.json(
        { message: "El DNI debe tener 8 dígitos" },
        { status: 400 }
      );
    }

    // 2. Buscar si ya existe en Firebase (Caché)
    const clienteRef = doc(db, "clientes", dni);
    const clienteSnap = await getDoc(clienteRef);

    if (clienteSnap.exists()) {
      // Devolvemos DIRECTAMENTE los datos del cliente
      return NextResponse.json(clienteSnap.data());
    }

    // 3. Si no existe, consultamos a la API Externa
    const datosReniec = await consultarDniReniec(dni);

    if (!datosReniec) {
      return NextResponse.json(
        { message: "DNI no encontrado en RENIEC" },
        { status: 404 }
      );
    }

    // 4. Guardar el nuevo cliente en Firestore
    const nuevoCliente = {
      ...datosReniec,
      pep: false,
      fechaRegistro: new Date().toISOString(),
      estado: "ACTIVO",
    };

    await setDoc(clienteRef, nuevoCliente);

    // Devolvemos DIRECTAMENTE los datos (Sin envolverlos en "datos" ni "exito")
    return NextResponse.json(nuevoCliente);
  } catch (error) {
    console.error("🔴 Error:", error);
    return NextResponse.json(
      { message: "Error interno", error: error.message },
      { status: 500 }
    );
  }
}
