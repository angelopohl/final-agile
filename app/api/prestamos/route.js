import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  limit,
  doc, // <-- Nuevo
  getDoc, // <-- Nuevo
} from "firebase/firestore";
import { FinancialService } from "@/lib/financialMath";

// --- GET (Sin cambios) ---
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni");
  try {
    const prestamosRef = collection(db, "prestamos");
    let q;
    if (dni) {
      q = query(prestamosRef, where("dniCliente", "==", dni));
    } else {
      q = query(prestamosRef, limit(50));
    }
    const querySnapshot = await getDocs(q);
    const prestamos = [];
    querySnapshot.forEach((doc) => {
      prestamos.push({ id: doc.id, ...doc.data() });
    });
    return NextResponse.json(prestamos);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- POST ---
export async function POST(request) {
  try {
    const body = await request.json();
    const { dni, monto, cuotas, tea, pep, fechaInicio } = body;

    if (!dni || !monto || !cuotas || !tea) {
      return NextResponse.json({ message: "Faltan datos" }, { status: 400 });
    }

    // --- TU VALIDACIÓN (INTACTA) ---
    const prestamosRef = collection(db, "prestamos");
    const q = query(
      prestamosRef,
      where("dniCliente", "==", dni),
      where("estado", "==", "PENDIENTE")
    );
    const duplicados = await getDocs(q);

    if (!duplicados.empty) {
      return NextResponse.json(
        { message: "El cliente ya tiene un préstamo PENDIENTE." },
        { status: 409 }
      );
    }

    // --- TUS CÁLCULOS (INTACTOS) ---
    const tem = FinancialService.calculateTem(tea);
    const cronograma = FinancialService.generateSchedule(
      monto,
      tem,
      cuotas,
      fechaInicio
    );
    const montoCuota = cronograma[0].amount;
    const totalIntereses = cronograma.reduce(
      (acc, item) => acc + item.interest,
      0
    );
    const totalPagar = monto + totalIntereses;

    let fechaFinal = fechaInicio;
    if (fechaFinal && fechaFinal.length === 10) fechaFinal += "T12:00:00";
    else if (!fechaFinal) fechaFinal = new Date().toISOString();

    // --- NUEVO: OBTENER NOMBRE (Lógica de tu amiga) ---
    let nombreCliente = "N/A";
    try {
      const clienteRef = doc(db, "clientes", dni);
      const clienteSnap = await getDoc(clienteRef);

      if (clienteSnap.exists()) {
        const d = clienteSnap.data();
        nombreCliente = `${d.apellidoPaterno || ""} ${
          d.apellidoMaterno || ""
        } ${d.nombres || ""}`.trim();
      }
    } catch (e) {
      console.log("No se pudo obtener nombre, guardando sin nombre.");
    }
    // --------------------------------------------------

    const nuevoPrestamo = {
      dniCliente: dni,
      nombreCliente: nombreCliente, // <-- Campo nuevo guardado
      montoSolicitado: parseFloat(monto),
      tea: parseFloat(tea),
      tem: tem,
      numeroCuotas: parseInt(cuotas),
      montoCuota: montoCuota,
      totalIntereses: parseFloat(totalIntereses.toFixed(2)),
      montoTotalPagar: parseFloat(totalPagar.toFixed(2)),
      esPep: pep || false,
      estado: "PENDIENTE",
      fechaInicio: fechaFinal,
      fechaCreacion: new Date().toISOString(),
      cronograma: cronograma,
    };

    const docRef = await addDoc(collection(db, "prestamos"), nuevoPrestamo);

    return NextResponse.json(
      {
        id: docRef.id,
        mensaje: "Préstamo creado exitosamente",
        ...nuevoPrestamo,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creando préstamo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
