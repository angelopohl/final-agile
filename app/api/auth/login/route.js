// app/api/auth/login/route.js
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; // Usamos Firestore directo para validar lo que sembramos
import { doc, getDoc } from "firebase/firestore";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 1. Validaciones básicas
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    // 2. Buscar al usuario en Firestore (Simulando UsuarioDao.findByEmail)
    // Nota: Como usamos el email como ID del documento en el Seeder, la búsqueda es directa.
    const userRef = doc(db, "usuarios", email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json(
        { message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const userData = userSnap.data();

    // 3. Validar Contraseña
    // OJO: En el Seeder guardamos la contraseña en texto plano "12345678" para el examen.
    // En Java usabas BCrypt, aquí comparamos directo por simplicidad del MVP.
    if (userData.password !== password) {
      return NextResponse.json(
        { message: "Contraseña incorrecta" },
        { status: 401 }
      );
    }

    // 4. Login Exitoso: Retornamos los datos del usuario (sin la contraseña)
    const { password: _, ...userWithoutPassword } = userData;

    return NextResponse.json({
      mensaje: "Autenticación exitosa",
      token: "fake-jwt-token-para-el-examen", // Aquí iría el JWT real si lo usáramos
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Error en login:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
