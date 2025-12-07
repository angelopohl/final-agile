"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
// Asegúrate de importar DollarSign para el Cuadre de Caja
import {
  LayoutDashboard,
  PlusCircle,
  User,
  LogOut,
  Landmark,
  FileText,
  DollarSign,
} from "lucide-react";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const isActive = (path) => pathname === path;

  const linkClass = (path) => `
    flex items-center gap-3 px-6 py-4 text-sm font-medium transition-all border-l-4
    ${
      isActive(path)
        ? "bg-blue-50 text-blue-700 border-blue-600"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-transparent"
    }
  `;

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* --- SIDEBAR IZQUIERDO (Barra de Navegación) --- */}
      <aside className="w-64 bg-white shadow-xl hidden md:flex flex-col z-10">
        <div className="p-6 border-b flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Landmark size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">
              PrestaPe
            </h1>
            <p className="text-xs text-gray-400 uppercase tracking-wider">
              Gestión Ágil
            </p>
          </div>
        </div>

        <nav className="mt-6 flex-1">
          <Link href="/dashboard" className={linkClass("/dashboard")}>
            <LayoutDashboard size={20} />
            Inicio / Buscar
          </Link>

          {/* --- ENLACE AGREGADO: CUADRE DE CAJA (Pagos) --- */}
          <Link href="/dashboard/caja" className={linkClass("/dashboard/caja")}>
            <DollarSign size={20} />
            Cuadre de Caja
          </Link>

          {/* --- ENLACE EXISTENTE: HISTORIAL GENERAL --- */}
          <Link
            href="/dashboard/prestamos"
            className={linkClass("/dashboard/prestamos")}
          >
            <FileText size={20} />
            Historial General
          </Link>

          <Link
            href="/dashboard/prestamos/nuevo"
            className={linkClass("/dashboard/prestamos/nuevo")}
          >
            <PlusCircle size={20} />
            Nuevo Préstamo
          </Link>

          <Link
            href="/dashboard/perfil"
            className={linkClass("/dashboard/perfil")}
          >
            <User size={20} />
            Mi Perfil
          </Link>
        </nav>

        {/* Botón Cerrar Sesión */}
        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-6 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <LogOut size={20} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden bg-white shadow p-4 flex justify-between items-center">
          <h1 className="font-bold text-blue-600">PrestaPe</h1>
          <button onClick={handleLogout} className="text-red-500">
            <LogOut size={20} />
          </button>
        </div>
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
