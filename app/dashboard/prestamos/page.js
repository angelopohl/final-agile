"use client";
import { useState, useEffect } from "react";
import { generarPDFCronograma } from "@/lib/pdfGenerator";

export default function HistorialPrestamosPage() {
  const [prestamos, setPrestamos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);

  // Cargar TODOS los préstamos al iniciar
  useEffect(() => {
    const fetchPrestamos = async () => {
      try {
        const res = await fetch("/api/prestamos"); // Sin DNI trae todo
        const data = await res.json();
        if (res.ok) {
          setPrestamos(data);
        }
      } catch (error) {
        console.error("Error cargando historial", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPrestamos();
  }, []);

  const formatearFecha = (fecha) => {
    if (!fecha) return "—";
    const date = new Date(fecha);
    return isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
  };

  const verDetalle = (prestamo) => {
    setPrestamoSeleccionado(prestamo);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">
          📚 Historial de Préstamos
        </h1>
        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
          Total: {prestamos.length}
        </span>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
        {loading ? (
          <p className="p-8 text-center text-gray-500">Cargando datos...</p>
        ) : prestamos.length === 0 ? (
          <p className="p-8 text-center text-gray-500">
            No hay préstamos registrados aún.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-4">DNI Cliente</th>
                <th className="p-4">Fecha</th>
                <th className="p-4 text-right">Monto</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prestamos.map((p) => (
                <tr key={p.id} className="hover:bg-blue-50 transition">
                  <td className="p-4 font-bold text-gray-700">
                    {p.dniCliente}
                  </td>
                  <td className="p-4 text-gray-500">
                    {formatearFecha(p.fechaInicio)}
                  </td>
                  <td className="p-4 text-right font-bold text-green-700">
                    S/ {p.montoSolicitado.toFixed(2)}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        p.estado === "PENDIENTE"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => verDetalle(p)}
                      className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
                    >
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL DETALLE (Reutilizado) */}
      {modalOpen && prestamoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-800">
                Detalle: {prestamoSeleccionado.dniCliente}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-red-500 text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Datos Resumen */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-gray-500">Monto Prestado</p>
                  <p className="font-bold">
                    S/ {prestamoSeleccionado.montoSolicitado}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Total a Pagar</p>
                  <p className="font-bold text-blue-600">
                    S/ {prestamoSeleccionado.montoTotalPagar}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Intereses</p>
                  <p className="font-bold text-red-500">
                    S/ {prestamoSeleccionado.totalIntereses}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Cuotas</p>
                  <p className="font-bold">
                    {prestamoSeleccionado.numeroCuotas}
                  </p>
                </div>
              </div>

              <button
                onClick={() => generarPDFCronograma(prestamoSeleccionado)}
                className="w-full bg-red-600 text-white py-2 rounded font-bold hover:bg-red-700 transition"
              >
                📄 Descargar Cronograma PDF
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
