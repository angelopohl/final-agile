import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import { FinancialService } from "@/lib/financialMath";

// --- GET: Buscar préstamos (Por DNI o Todos) ---
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dni = searchParams.get("dni");

  try {
    const prestamosRef = collection(db, "prestamos");
    let q;

    if (dni) {
      // Si hay DNI, filtramos
      q = query(prestamosRef, where("dniCliente", "==", dni));
    } else {
      // Si NO hay DNI, traemos los últimos 50 (Modo Historial General)
      // Nota: orderBy requiere un índice en Firebase, si falla úsalo sin orderBy primero
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

// --- POST: Crear nuevo préstamo (Mantenemos igual que antes) ---
export async function POST(request) {
  try {
    const body = await request.json();
    const { dni, monto, cuotas, tea, pep, fechaInicio } = body;

    if (!dni || !monto || !cuotas || !tea) {
      return NextResponse.json(
        { message: "Faltan datos (dni, monto, cuotas, tea)" },
        { status: 400 }
      );
    }

    // Regla: Un solo préstamo pendiente por cliente
    const prestamosRef = collection(db, "prestamos");
    const q = query(
      prestamosRef,
      where("dniCliente", "==", dni),
      where("estado", "==", "PENDIENTE")
    );
    const duplicados = await getDocs(q);

    if (!duplicados.empty) {
      return NextResponse.json(
        { message: "El cliente ya tiene un préstamo pendiente." },
        { status: 409 }
      );
    }

    // Cálculos
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

    // Fechas seguras
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
