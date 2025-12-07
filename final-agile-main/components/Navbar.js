// components/Navbar.js
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-blue-900 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          🏦 Prestamos Agile
        </Link>
        <div className="space-x-4">
          <Link href="/prestamos/crear" className="hover:text-blue-200">
            Nuevo Préstamo
          </Link>
          <Link href="/login" className="hover:text-blue-200">
            Salir
          </Link>
        </div>
      </div>
    </nav>
  );
}
