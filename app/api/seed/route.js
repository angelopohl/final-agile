// app/api/seed/route.js
import { NextResponse } from "next/server";
import { UserService } from "@/services/userService";

export async function GET(request) {
  try {
    const adminEmail = "admin@gmail.com"; // El mismo del Java

    // 1. Verificamos si ya existe el admin
    const existingAdmin = await UserService.findByEmail(adminEmail);

    if (existingAdmin) {
      return NextResponse.json({
        message: "El Admin ya existe. No es necesario sembrar datos.",
      });
    }

    // 2. Si no existe, lo creamos
    const newAdmin = await UserService.createUser({
      email: adminEmail,
      firstname: "Edward",
      lastname: "Castillo",
      role: "ADMIN",
      password: "12345678", // OJO: En producción real, esto se encriptaría o se delegaría a Firebase Auth
      phone: "999888777",
    });

    return NextResponse.json({
      message: "✅ Usuario ADMIN creado exitosamente",
      usuario: newAdmin,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
