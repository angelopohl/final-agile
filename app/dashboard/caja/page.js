"use client";
import { useState, useEffect } from "react";
import { Wallet, CreditCard, Banknote, Smartphone } from "lucide-react";

export default function CuadreCajaPage() {
  const [movimientos, setMovimientos] = useState([]);
  const [resumen, setResumen] = useState({ total: 0, efectivo: 0, digital: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPagos = async () => {
      try {
        const res = await fetch("/api/caja");
        const data = await res.json();

        const hoy = new Date().toISOString().split("T")[0];
        const pagosHoy = data.filter((p) => p.fechaRegistro.startsWith(hoy));

        setMovimientos(pagosHoy);

        let total = 0;
        let efectivo = 0;
        let digital = 0;

        pagosHoy.forEach((p) => {
          const cobro = Number(p.montoTotal || 0);

          total += cobro;

          if (p.medioPago === "EFECTIVO") {
            efectivo += cobro;
          } else {
            digital += cobro;
          }
        });

        setResumen({
          total: Number(total.toFixed(2)),
          efectivo: Number(efectivo.toFixed(2)),
          digital: Number(digital.toFixed(2)),
        });

        setLoading(false);
      } catch (error) {
        console.error("Error cargando caja:", error);
        setLoading(false);
      }
    };

    fetchPagos();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <Banknote className="text-green-600" size={32} />
          Cuadre de Caja Diario
        </h1>
        <p className="text-gray-500 mt-1">
          Movimientos registrados el {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-600">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">
                Ingresos Totales
              </p>
              <h2 className="text-4xl font-bold">
                S/ {resumen.total.toFixed(2)}
              </h2>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
              <Wallet size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-600">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">Efectivo</p>
              <h2 className="text-4xl font-bold text-green-700">
                S/ {resumen.efectivo.toFixed(2)}
              </h2>
            </div>
            <div className="bg-green-100 p-3 rounded-lg text-green-600">
              <Banknote size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-gray-500 uppercase">Digitales</p>
              <h2 className="text-4xl font-bold text-purple-700">
                S/ {resumen.digital.toFixed(2)}
              </h2>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg text-purple-600">
              <Smartphone size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h3 className="font-bold text-gray-700">Detalle de Operaciones</h3>
        </div>

        {loading ? (
          <p className="p-8 text-center text-gray-500">Calculando cierre...</p>
        ) : movimientos.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-lg">
              No hay movimientos registrados hoy.
            </p>
            <p className="text-gray-300 text-sm">La caja está en cero.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-4">Hora</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Concepto</th>
                <th className="p-4">Medio</th>
                <th className="p-4 text-right">Monto</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {movimientos.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="p-4 font-mono text-gray-500">
                    {new Date(m.fechaRegistro).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>

                  <td className="p-4">{m.dniCliente}</td>

                  <td className="p-4">
                    Cuota {m.numeroCuota}
                    {m.desglose?.mora > 0 && (
                      <span className="ml-2 text-xs text-red-500">
                        (+ Mora)
                      </span>
                    )}
                  </td>

                  <td className="p-4">
                    <span
                      className={`px-2 py-1 text-xs font-bold rounded ${
                        m.medioPago === "EFECTIVO"
                          ? "bg-green-100 text-green-700"
                          : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {m.medioPago}
                    </span>
                  </td>

                  <td className="p-4 text-right font-bold text-gray-800">
                    S/ {Number(m.montoTotal || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
