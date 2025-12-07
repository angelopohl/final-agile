"use client";
import { useState, useEffect } from "react";

export default function PerfilPage() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [mensaje, setMensaje] = useState({ text: "", type: "" });

  useEffect(() => {
    // Verificamos si window existe para evitar errores
    if (typeof window !== "undefined") {
      const u = localStorage.getItem("user");
      if (u) {
        try {
          // eslint-disable-next-line react-hooks/exhaustive-deps
          setUser(JSON.parse(u));
        } catch (e) {
          console.error("Error leyendo usuario", e);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje("");

    if (!user) return;

    try {
      const res = await fetch("/api/auth/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          password: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMensaje({
          text: "✅ Contraseña actualizada con éxito",
          type: "success",
        });
        setForm({ currentPassword: "", newPassword: "" });
      } else {
        setMensaje({ text: "❌ " + data.message, type: "error" });
      }
    } catch (error) {
      setMensaje({ text: "Error de conexión", type: "error" });
    }
  };

  if (!user) return <p className="p-8 text-gray-500">Cargando perfil...</p>;

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md mt-10 border border-gray-100">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
        👤 Mi Perfil
      </h2>

      <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200">
        <div className="mb-3">
          <label className="block text-xs uppercase font-bold text-gray-400 mb-1">
            Nombre
          </label>
          <p className="font-bold text-lg text-gray-800">
            {user.firstname} {user.lastname}
          </p>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold text-gray-400 mb-1">
            Correo
          </label>
          <p className="font-medium text-gray-700">{user.email}</p>
        </div>
      </div>

      <hr className="my-6 border-gray-200" />

      <h3 className="text-lg font-bold mb-4 text-blue-600">
        Cambiar Contraseña
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contraseña Actual
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={form.currentPassword}
            onChange={(e) =>
              setForm({ ...form, currentPassword: e.target.value })
            }
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nueva Contraseña
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            required
          />
        </div>

        {mensaje.text && (
          <div
            className={`p-3 rounded-lg text-sm font-medium ${
              mensaje.type === "success"
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-red-100 text-red-700 border border-red-200"
            }`}
          >
            {mensaje.text}
          </div>
        )}

        <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg shadow-blue-500/30">
          Actualizar Contraseña
        </button>
      </form>
    </div>
  );
}
