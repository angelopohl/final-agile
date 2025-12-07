import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";

export async function GET() {
  try {
    const pagosRef = collection(db, "pagos");
    // Traemos los últimos 100 pagos (para el examen es suficiente y rápido)
    // En producción usaríamos un filtro por fecha en la query, pero requiere índices compuestos.
    const q = query(pagosRef, limit(100));

    const snapshot = await getDocs(q);
    const pagos = [];
    snapshot.forEach((doc) => {
      pagos.push({ id: doc.id, ...doc.data() });
    });

    // Ordenar por fecha descendente (más reciente primero) en memoria
    pagos.sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro));

    return NextResponse.json(pagos);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
