"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generarPDFCronograma } from "@/lib/pdfGenerator";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState({ firstname: "Admin" });
  const [dniBusqueda, setDniBusqueda] = useState("");
  const [prestamos, setPrestamos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const buscarPrestamos = async (e) => {
    e.preventDefault();
    if (dniBusqueda.length !== 8) {
      setMensaje("Ingrese un DNI de 8 dígitos");
      return;
    }
    setLoading(true);
    setMensaje("");
    setPrestamos([]);

    try {
      const res = await fetch(`/api/prestamos?dni=${dniBusqueda}`);
      const data = await res.json();

      if (res.ok) {
        if (data.length === 0) setMensaje("No se encontraron préstamos.");
        else setPrestamos(data);
      } else {
        setMensaje("Error: " + (data.message || "Desconocido"));
      }
    } catch (error) {
      setMensaje("Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "—";
    const date = new Date(fecha);
    return isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
  };

  const verDetalle = (prestamo) => {
    setPrestamoSeleccionado(prestamo);
    setModalOpen(true);
  };

  const irACobranza = (prestamoId) => {
    // Aquí ya NO se llama a Mercado Pago.
    // Solo vamos a la pantalla de caja donde están las opciones:
    // efectivo / Yape / tarjeta.
    router.push(`/dashboard/prestamos/${prestamoId}`);
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Hola, {user.firstname} 👋
          </h1>
          <p className="text-gray-500">Panel de Administración</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <form onSubmit={buscarPrestamos} className="flex gap-4">
          <input
            type="text"
            placeholder="DNI del cliente..."
            className="flex-1 border p-3 rounded-lg outline-none focus:border-blue-500"
            maxLength={8}
            value={dniBusqueda}
            onChange={(e) => setDniBusqueda(e.target.value.replace(/\D/g, ""))}
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "..." : "Buscar"}
          </button>
        </form>
        {mensaje && <p className="mt-4 text-red-500 font-medium">{mensaje}</p>}
      </div>

      {/* Tabla Resultados */}
      {prestamos.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">Fecha</th>
                <th className="p-4 text-right">Monto</th>
                <th className="p-4 text-right">Cuotas</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prestamos.map((p) => (
                <tr key={p.id} className="hover:bg-blue-50">
                  <td className="p-4 font-mono text-xs text-gray-500">
                    {p.id ? p.id.substring(0, 8) + "..." : "-"}
                  </td>

                  <td className="p-4">
                    {formatearFecha(p.fechaInicio || p.fechaCreacion)}
                  </td>
                  <td className="p-4 text-right font-bold">
                    S/ {p.montoSolicitado.toFixed(2)}
                  </td>
                  <td className="p-4 text-right">{p.numeroCuotas} meses</td>

                  <td className="p-4 text-center">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-700">
                      {p.estado}
                    </span>
                  </td>

                  <td className="p-4 text-center space-x-2">
                    <button
                      onClick={() => verDetalle(p)}
                      className="text-blue-600 hover:underline font-semibold text-sm"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => irACobranza(p.id)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-700"
                    >
                      Cobrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Detalle solo informativo */}
      {modalOpen && prestamoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800">
                Detalle del Préstamo
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-red-500 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">ID Préstamo</p>
                  <p className="font-mono font-bold">
                    {prestamoSeleccionado.id}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Fecha Inicio</p>
                  <p className="font-bold">
                    {formatearFecha(prestamoSeleccionado.fechaInicio)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Monto Total a Pagar</p>
                  <p className="font-bold text-green-600">
                    S/ {prestamoSeleccionado.montoTotalPagar.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Interés Total</p>
                  <p className="font-bold text-blue-600">
                    S/ {prestamoSeleccionado.totalIntereses.toFixed(2)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => generarPDFCronograma(prestamoSeleccionado)}
                className="w-full bg-red-600 text-white py-2 rounded flex items-center justify-center gap-2 hover:bg-red-700 transition"
              >
                📄 Descargar Cronograma en PDF
              </button>

              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Vence</th>
                      <th className="p-2 text-right">Cuota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {prestamoSeleccionado.cronograma.map((c) => (
                      <tr key={c.num}>
                        <td className="p-2">{c.num}</td>
                        <td className="p-2">{c.dueDate}</td>
                        <td className="p-2 text-right font-bold">
                          S/ {c.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => irACobranza(prestamoSeleccionado.id)}
                className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 transition"
              >
                Ir a Cobranza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
