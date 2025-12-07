"use client";
import { useState, useEffect } from "react";
import { FinancialService } from "@/lib/financialMath";

export default function NuevoPrestamoPage() {
  // --- Estados ---
  const [paso, setPaso] = useState(1); // 1: Verificar DNI, 2: Llenar Datos
  const [dniBusqueda, setDniBusqueda] = useState("");
  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Formulario del Préstamo
  const [form, setForm] = useState({
    monto: 1000,
    cuotas: 12,
    tea: 20,
    pep: false,
    fechaInicio: new Date().toISOString().split("T")[0], // Fecha de hoy (Bloqueada)
  });

  // Resultados Simulados
  const [cronograma, setCronograma] = useState([]);
  const [alertas, setAlertas] = useState({ uit: false, pep: false });

  // --- Lógica Paso 1: Verificar DNI ---
  // --- Lógica Paso 1: Verificar DNI (MODIFICADA) ---
  const verificarDNI = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    console.log("🚀 Enviando petición al backend..."); // LOG 1

    try {
      const res = await fetch("/api/cliente/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni: dniBusqueda }),
      });

      console.log("📡 Estado Respuesta:", res.status); // LOG 2

      const data = await res.json();
      console.log("📦 Datos recibidos en Frontend:", data); // LOG 3

      if (res.ok) {
        // Aseguramos que data no sea null antes de guardar
        if (data && (data.nombres || data.nombreCompleto)) {
          setCliente(data);
          setPaso(2); // Avanzamos de pantalla
        } else {
          setError("El backend respondió OK, pero sin datos de nombres.");
        }
      } else {
        setError(data.message || "Error al verificar DNI");
      }
    } catch (err) {
      console.error("🔴 Error Frontend:", err);
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  // --- Lógica Paso 2: Simulación y Guardado ---

  // Efecto: Recalcular cronograma cada vez que cambian los inputs
  useEffect(() => {
    if (paso === 2) {
      const tem = FinancialService.calculateTem(form.tea);
      const schedule = FinancialService.generateSchedule(
        Number(form.monto),
        tem,
        Number(form.cuotas),
        form.fechaInicio
      );
      setCronograma(schedule);

      // Reglas de Negocio Visuales (UIT = 5350 aprox)
      const LIMITE_UIT = 5350;
      setAlertas({
        uit: Number(form.monto) >= LIMITE_UIT,
        pep: form.pep,
      });
    }
  }, [form, paso]);

  const guardarPrestamo = async () => {
    if (!cliente) return;
    setLoading(true);

    try {
      const payload = {
        dni: cliente.dni,
        monto: Number(form.monto),
        cuotas: Number(form.cuotas),
        tea: Number(form.tea),
        pep: form.pep,
        fechaInicio: form.fechaInicio,
      };

      const res = await fetch("/api/prestamos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        alert("✅ Préstamo Creado Exitosamente ID: " + data.id);
        // Redirigir al Dashboard o limpiar
        window.location.href = "/dashboard";
      } else {
        alert("❌ Error: " + (data.message || data.error));
      }
    } catch (err) {
      alert("Error de red");
    } finally {
      setLoading(false);
    }
  };

  // --- Renderizado ---
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">
        Solicitud de Crédito
      </h2>

      {/* PASO 1: Buscador de DNI */}
      {paso === 1 && (
        <div className="bg-white p-8 rounded-lg shadow-md">
          <label className="block text-gray-700 font-bold mb-2">
            Ingrese DNI del Cliente
          </label>
          <form onSubmit={verificarDNI} className="flex gap-4">
            <input
              type="text"
              maxLength={8}
              className="border p-3 rounded w-full text-lg"
              placeholder="Ej: 46027897"
              value={dniBusqueda}
              onChange={(e) =>
                setDniBusqueda(e.target.value.replace(/\D/g, ""))
              }
            />
            <button
              type="submit"
              disabled={loading || dniBusqueda.length !== 8}
              className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:bg-gray-400 font-bold"
            >
              {loading ? "Buscando..." : "Verificar"}
            </button>
          </form>
          {error && (
            <p className="text-red-500 mt-4 font-semibold">⚠️ {error}</p>
          )}
        </div>
      )}

      {/* PASO 2: Formulario de Datos */}
      {paso === 2 && cliente && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda: Formulario */}
          <div className="lg:col-span-1 space-y-6">
            {/* Tarjeta Cliente */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-600 font-bold">
                Cliente Verificado
              </p>
              <p className="text-lg font-bold text-gray-800">
                {cliente.nombres} {cliente.apellidoPaterno}
              </p>
              <p className="text-gray-600">DNI: {cliente.dni}</p>
              <button
                onClick={() => setPaso(1)}
                className="text-sm text-blue-500 underline mt-2"
              >
                Cambiar cliente
              </button>
            </div>

            {/* Inputs */}
            <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
              <div>
                <label className="block text-gray-700 font-bold">
                  Monto (S/)
                </label>
                <input
                  type="number"
                  className="w-full border p-2 rounded mt-1"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  min="1"
                  max="1000000"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold">
                  Cuotas (Meses)
                </label>
                <input
                  type="number"
                  className="w-full border p-2 rounded mt-1"
                  value={form.cuotas}
                  onChange={(e) => setForm({ ...form, cuotas: e.target.value })}
                  min="1"
                  max="60"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold">
                  TEA Anual (%)
                </label>
                <input
                  type="number"
                  className="w-full border p-2 rounded mt-1"
                  value={form.tea}
                  onChange={(e) => setForm({ ...form, tea: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  className="w-full border p-2 rounded mt-1 bg-gray-100 cursor-not-allowed"
                  value={form.fechaInicio}
                  readOnly
                />
              </div>

              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="pep"
                  checked={form.pep}
                  onChange={(e) => setForm({ ...form, pep: e.target.checked })}
                  className="w-5 h-5 text-blue-600"
                />
                <label htmlFor="pep" className="text-gray-700 font-medium">
                  Es Persona Políticamente Expuesta (PEP)
                </label>
              </div>

              {/* ALERTAS DINÁMICAS */}
              {(alertas.uit || alertas.pep) && (
                <div className="bg-orange-100 border-l-4 border-orange-500 p-4 mt-4">
                  <p className="font-bold text-orange-700">
                    ⚠️ Requiere Documentación Adicional
                  </p>
                  <p className="text-sm text-orange-600">
                    {alertas.uit && "• El monto supera 1 UIT. "}
                    {alertas.pep && "• El cliente es PEP."}
                  </p>
                  <button className="mt-2 text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded hover:bg-orange-300">
                    <a
                      href="/ddjj_formato.pdf"
                      download="Declaracion_Jurada_Origen_Fondos.pdf"
                      className="mt-2 inline-block text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded hover:bg-orange-300 decoration-none"
                    >
                      📄 Descargar DDJJ Origen de Fondos
                    </a>
                  </button>
                </div>
              )}

              <button
                onClick={guardarPrestamo}
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 mt-6 shadow-lg transform hover:scale-105 transition"
              >
                {loading ? "Procesando..." : "CONFIRMAR PRÉSTAMO"}
              </button>
            </div>
          </div>

          {/* Columna Derecha: Cronograma Previo */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-lg shadow-md h-full">
              <h3 className="text-xl font-bold mb-4 text-gray-700">
                Simulación de Cronograma
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                      <th className="px-4 py-3">N°</th>
                      <th className="px-4 py-3">Vencimiento</th>
                      <th className="px-4 py-3 text-right">Cuota</th>
                      <th className="px-4 py-3 text-right">Interés</th>
                      <th className="px-4 py-3 text-right">Amort.</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cronograma.map((row) => (
                      <tr key={row.num} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">{row.num}</td>
                        <td className="px-4 py-3">{row.dueDate}</td>
                        <td className="px-4 py-3 font-bold text-right">
                          S/ {row.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-500">
                          {row.interest.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600">
                          {row.capital.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {row.balance.toFixed(2)}
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
