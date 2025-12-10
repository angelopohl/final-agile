"use client";
import { useState, useEffect } from "react";
import {
  Wallet,
  Banknote,
  Smartphone,
  Lock,
  Unlock,
  Printer,
} from "lucide-react";

export default function CuadreCajaPage() {
  // Datos
  const [loading, setLoading] = useState(true);
  const [sesion, setSesion] = useState(null); // null, { estado: 'ABIERTA' }, { estado: 'CERRADA' }
  const [movimientos, setMovimientos] = useState([]);

  // Totales calculados
  const [resumen, setResumen] = useState({
    ventasTotal: 0,
    ventasEfectivo: 0,
    ventasDigital: 0,
    totalEnCaja: 0, // (Inicial + Ventas Efectivo)
  });

  // Inputs formularios
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [procesando, setProcesando] = useState(false);

  const fetchCaja = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/caja");
      const data = await res.json(); // { sesion, pagos }

      if (data.error) throw new Error(data.error);

      setSesion(data.sesion);
      setMovimientos(data.pagos || []);

      // Calcular totales
      let vTotal = 0;
      let vEfectivo = 0;
      let vDigital = 0;

      (data.pagos || []).forEach((p) => {
        const monto = Number(p.montoTotal || 0);
        vTotal += monto;
        if (p.medioPago === "EFECTIVO") {
          vEfectivo += monto;
        } else {
          vDigital += monto;
        }
      });

      const inicio = data.sesion ? Number(data.sesion.montoInicial || 0) : 0;

      setResumen({
        ventasTotal: vTotal,
        ventasEfectivo: vEfectivo,
        ventasDigital: vDigital,
        totalEnCaja: inicio + vEfectivo, // La fórmula clave
      });
    } catch (error) {
      console.error("Error cargando caja:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaja();
  }, []);

  // --- ACCIONES ---

  // NUEVA FUNCIÓN: DESCARGAR PDF
  const descargarReporte = async () => {
    try {
      const res = await fetch("/api/caja/reporte");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte_caja_${
          new Date().toISOString().split("T")[0]
        }.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const err = await res.json();
        alert("Error generando el reporte: " + (err.error || "Desconocido"));
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión al generar reporte");
    }
  };

  const abrirCaja = async () => {
    if (!montoInicialInput) return alert("Ingresa un monto inicial");
    setProcesando(true);
    try {
      const res = await fetch("/api/caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ABRIR",
          montoInicial: montoInicialInput,
        }),
      });
      if (res.ok) {
        setMontoInicialInput("");
        fetchCaja(); // Recargar todo
      } else {
        alert("Error al abrir caja");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcesando(false);
    }
  };

  const cerrarCaja = async () => {
    if (!confirm("¿Estás seguro de CERRAR la caja por hoy?")) return;
    setProcesando(true);
    try {
      const res = await fetch("/api/caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CERRAR",
          sesionId: sesion.id,
          montoFinal: resumen.totalEnCaja, // Guardamos lo que debería haber
        }),
      });
      if (res.ok) {
        fetchCaja();
      } else {
        alert("Error al cerrar caja");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcesando(false);
    }
  };

  if (loading)
    return <p className="p-8 text-center text-gray-500">Cargando Caja...</p>;

  // ----------------------------------------------------
  // CASO 1: CAJA CERRADA / NO INICIADA -> FORMULARIO
  // ----------------------------------------------------
  if (!sesion) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-white p-8 rounded-xl shadow-lg border border-gray-100 text-center">
        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
          <Unlock size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Apertura de Caja
        </h1>
        <p className="text-gray-500 mb-6 text-sm">
          Ingresa el dinero base (sencillo) para iniciar las operaciones del
          día.
        </p>

        <div className="mb-6 text-left">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monto Inicial (Efectivo)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-gray-400">S/</span>
            <input
              type="number"
              className="w-full pl-8 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
              placeholder="0.00"
              value={montoInicialInput}
              onChange={(e) => setMontoInicialInput(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={abrirCaja}
          disabled={procesando}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition-all"
        >
          {procesando ? "Abriendo..." : "ABRIR CAJA HOY"}
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // CASO 2: CAJA YA CERRADA (FIN DEL DÍA)
  // ----------------------------------------------------
  if (sesion.estado === "CERRADA") {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-gray-50 p-8 rounded-xl border border-gray-200 text-center">
        <div className="bg-gray-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-600">
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Caja Cerrada</h1>
        <p className="text-gray-500 mt-2">
          La sesión del día <b>{sesion.fecha}</b> ha finalizado.
        </p>

        <div className="grid grid-cols-2 gap-4 mt-8 max-w-md mx-auto">
          <div className="bg-white p-4 rounded shadow-sm">
            <p className="text-xs text-gray-400 uppercase">Monto Inicial</p>
            <p className="font-bold text-lg">
              S/ {sesion.montoInicial.toFixed(2)}
            </p>
          </div>
          <div className="bg-white p-4 rounded shadow-sm">
            <p className="text-xs text-gray-400 uppercase">Cierre Final</p>
            <p className="font-bold text-lg text-gray-800">
              S/ {sesion.montoFinal?.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Botón para imprimir el reporte incluso si ya está cerrada */}
        <div className="mt-6">
          <button
            onClick={descargarReporte}
            className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-700 mx-auto text-sm font-medium"
          >
            <Printer size={16} />
            Descargar Reporte Final
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // CASO 3: CAJA ABIERTA (DASHBOARD)
  // ----------------------------------------------------
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Banknote className="text-green-600" size={32} />
            Control de Caja
          </h1>
          <p className="text-gray-500 mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Sesión Abierta • {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* GRUPO DE BOTONES DE ACCIÓN */}
        <div className="flex gap-2">
          <button
            onClick={descargarReporte}
            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm font-medium shadow-sm"
          >
            <Printer size={16} />
            Exportar PDF
          </button>

          <button
            onClick={cerrarCaja}
            disabled={procesando}
            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 text-sm font-medium"
          >
            Cerrar Caja
          </button>
        </div>
      </div>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* TARJETA 1: DINERO REAL EN CAJA (Lo más importante) */}
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-600 relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-sm text-gray-500 uppercase font-bold tracking-wide">
              Efectivo en Cajón
            </p>
            <h2 className="text-4xl font-extrabold text-gray-800 mt-2">
              S/ {resumen.totalEnCaja.toFixed(2)}
            </h2>
            <div className="mt-2 text-xs text-green-700 bg-green-50 inline-block px-2 py-1 rounded">
              Base (S/ {sesion.montoInicial}) + Ventas (S/{" "}
              {resumen.ventasEfectivo.toFixed(2)})
            </div>
          </div>
          <div className="absolute right-4 top-6 text-green-100 opacity-50">
            <Banknote size={80} />
          </div>
        </div>

        {/* TARJETA 2: VENTAS TOTALES (Rendimiento) */}
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-600">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-gray-500 uppercase font-bold">
              Ventas Totales
            </p>
            <Wallet className="text-blue-500 opacity-50" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-blue-700">
            S/ {resumen.ventasTotal.toFixed(2)}
          </h2>
          <p className="text-xs text-gray-400 mt-1">Incluye Digitales</p>
        </div>

        {/* TARJETA 3: DIGITALES (Banco) */}
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-gray-500 uppercase font-bold">
              Bancos / Digital
            </p>
            <Smartphone className="text-purple-500 opacity-50" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-purple-700">
            S/ {resumen.ventasDigital.toFixed(2)}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Yape, Tarjetas, Transferencias
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">Movimientos del Día</h3>
          <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">
            {movimientos.length} operaciones
          </span>
        </div>

        {movimientos.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-lg">
              Caja abierta, esperando clientes...
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-4">Hora</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Detalle</th>
                <th className="p-4 text-center">Medio</th>
                <th className="p-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movimientos.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-mono text-gray-500">
                    {new Date(m.fechaRegistro).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Lima", // Forzamos visualización correcta
                    })}
                  </td>
                  <td className="p-4 text-gray-700 font-medium">
                    {m.dniCliente}
                  </td>
                  <td className="p-4 text-gray-600">
                    Cuota {m.numeroCuota}
                    {m.desglose?.mora > 0 && (
                      <span className="ml-2 text-[10px] text-red-600 bg-red-50 px-1 py-0.5 rounded border border-red-100">
                        MORA
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide ${
                        m.medioPago === "EFECTIVO"
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : "bg-purple-100 text-purple-700 border border-purple-200"
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
