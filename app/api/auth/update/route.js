import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export async function POST(request) {
  try {
    const { email, password, newPassword } = await request.json();

    if (!email || !password || !newPassword) {
      return NextResponse.json({ message: "Faltan datos" }, { status: 400 });
    }

    const userRef = doc(db, "usuarios", email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json(
        { message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const userData = userSnap.data();

    // Validar contraseña actual (En un caso real usarías bcrypt)
    if (userData.password !== password) {
      return NextResponse.json(
        { message: "La contraseña actual es incorrecta" },
        { status: 401 }
      );
    }

    // Actualizar contraseña
    await updateDoc(userRef, { password: newPassword });

    return NextResponse.json({
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
