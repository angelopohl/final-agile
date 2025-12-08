import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { FinancialService } from "@/lib/financialMath";

// --- GET: Buscar préstamos (Igual que antes) ---
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

// --- POST: Crear nuevo préstamo ---
export async function POST(request) {
  try {
    const body = await request.json();
    const { dni, monto, cuotas, tea, pep, fechaInicio } = body;

    if (!dni || !monto || !cuotas || !tea) {
      return NextResponse.json(
        { message: "Faltan datos requeridos" },
        { status: 400 }
      );
    }

    // --- VALIDACIÓN ESTADO PENDIENTE (Lógica Binaria) ---
    const prestamosRef = collection(db, "prestamos");
    // Solo buscamos PENDIENTE. Como eliminamos VIGENTE, esto cubre todo caso activo.
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

    // --- CÁLCULOS (Tu lógica financiera) ---
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

    // Fechas
    let fechaFinal = fechaInicio;
    if (fechaFinal && fechaFinal.length === 10) {
      fechaFinal += "T12:00:00";
    } else if (!fechaFinal) {
      fechaFinal = new Date().toISOString();
    }

    const nuevoPrestamo = {
      dniCliente: dni,
      montoSolicitado: parseFloat(monto),
      tea: parseFloat(tea),
      tem: tem,
      numeroCuotas: parseInt(cuotas),
      montoCuota: montoCuota,
      totalIntereses: parseFloat(totalIntereses.toFixed(2)),
      montoTotalPagar: parseFloat(totalPagar.toFixed(2)),
      esPep: pep || false,
      estado: "PENDIENTE", // Nace PENDIENTE
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
