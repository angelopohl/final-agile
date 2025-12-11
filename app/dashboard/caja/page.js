"use client";
import { useState, useEffect } from "react";
import {
  Wallet,
  Banknote,
  Smartphone,
  Lock,
  Unlock,
  Printer,
  PlusCircle,
  X,
} from "lucide-react";

export default function CuadreCajaPage() {
  const [loading, setLoading] = useState(true);
  const [sesion, setSesion] = useState(null);
  const [movimientos, setMovimientos] = useState([]);

  // Totales
  const [resumen, setResumen] = useState({
    ventasTotal: 0,
    ventasEfectivo: 0,
    ventasDigital: 0,
    ingresosExtra: 0,
    totalEnCaja: 0,
  });

  // Inputs Apertura
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [procesando, setProcesando] = useState(false);

  // Inputs Ingreso Dinero
  const [modalIngresoOpen, setModalIngresoOpen] = useState(false);
  const [montoIngreso, setMontoIngreso] = useState("");
  const [descIngreso, setDescIngreso] = useState("");

  // --- FUNCIÓN DE REDONDEO ---
  const redondearEfectivo = (valor) => {
    return Math.round(valor * 10) / 10;
  };

  const fetchCaja = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/caja");
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setSesion(data.sesion);
      setMovimientos(data.pagos || []);

      let vTotal = 0;
      let vEfectivo = 0;
      let vDigital = 0;
      let vIngresosExtra = 0;

      (data.pagos || []).forEach((p) => {
        // No sumamos APERTURA aquí porque ya está en 'sesion.montoInicial'
        if (p.tipo === "PAGO") {
          const monto = Number(p.montoTotal || 0);
          vTotal += monto;
          if (p.medioPago === "EFECTIVO") {
            vEfectivo += monto;
          } else {
            vDigital += monto;
          }
        } else if (p.tipo === "INGRESO") {
          const monto = Number(p.monto || 0);
          vIngresosExtra += monto;
        }
      });

      const inicio = data.sesion ? Number(data.sesion.montoInicial || 0) : 0;

      // Calculamos el matemático exacto
      const cajaMatematica = inicio + vEfectivo + vIngresosExtra;

      // Aplicamos el redondeo a la Caja y a las Ventas Totales
      const cajaRedondeada = redondearEfectivo(cajaMatematica);
      const ventasTotalesRedondeadas = redondearEfectivo(vTotal);

      setResumen({
        ventasTotal: ventasTotalesRedondeadas,
        ventasEfectivo: vEfectivo,
        ventasDigital: vDigital,
        ingresosExtra: vIngresosExtra,
        totalEnCaja: cajaRedondeada,
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
      alert("Error de conexión");
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
        fetchCaja();
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
          montoFinal: resumen.totalEnCaja,
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

  const ingresarDinero = async () => {
    if (!montoIngreso || !descIngreso) return alert("Completa los datos");

    const valor = Number(montoIngreso);

    if (valor > 999999) {
      return alert("El monto no puede superar 999,999.00");
    }
    if (valor <= 0) {
      return alert("El monto debe ser mayor a 0");
    }

    if ((valor * 10) % 1 !== 0) {
      return alert(
        "Solo se permiten montos múltiplos de 10 céntimos (Ej: 1.30, 5.50)."
      );
    }

    setProcesando(true);
    try {
      const res = await fetch("/api/caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "INGRESO",
          montoIngreso: montoIngreso,
          descripcionIngreso: descIngreso,
        }),
      });
      if (res.ok) {
        setModalIngresoOpen(false);
        setMontoIngreso("");
        setDescIngreso("");
        fetchCaja();
      } else {
        alert("Error al registrar ingreso");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setProcesando(false);
    }
  };

  if (loading)
    return <p className="p-8 text-center text-gray-500">Cargando Caja...</p>;

  // CASO 1: CAJA CERRADA / NO INICIADA
  if (!sesion) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-white p-8 rounded-xl shadow-lg border border-gray-100 text-center">
        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
          <Unlock size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Apertura de Caja
        </h1>
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

  // CASO 2: CAJA YA CERRADA
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

  // CASO 3: CAJA ABIERTA
  return (
    <div className="space-y-8 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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

        <div className="flex gap-2">
          <button
            onClick={() => setModalIngresoOpen(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"
          >
            <PlusCircle size={16} />
            Ingresar Dinero
          </button>

          <button
            onClick={descargarReporte}
            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm font-medium shadow-sm"
          >
            <Printer size={16} />
            Exportar
          </button>

          <button
            onClick={cerrarCaja}
            disabled={procesando}
            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 text-sm font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. EFECTIVO EN CAJÓN */}
        <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-green-600 relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">
              Efectivo en Cajón
            </p>
            <h2 className="text-3xl font-extrabold text-gray-800 mt-1">
              S/ {resumen.totalEnCaja.toFixed(2)}
            </h2>
            <div className="mt-1 text-[10px] text-green-700 bg-green-50 inline-block px-2 py-1 rounded">
              (Redondeado)
            </div>
          </div>
          <div className="absolute right-2 top-4 text-green-100 opacity-50">
            <Banknote size={60} />
          </div>
        </div>

        {/* 2. VENTAS TOTALES */}
        <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-blue-600">
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-gray-500 uppercase font-bold">
              Pagos Totales
            </p>
            <Wallet className="text-blue-500 opacity-50" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-blue-700">
            S/ {resumen.ventasTotal.toFixed(2)}
          </h2>
          <div className="mt-1 text-[10px] text-blue-700 bg-blue-50 inline-block px-2 py-1 rounded">
            (Redondeado)
          </div>
        </div>

        {/* 3. VENTAS DIGITALES */}
        <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-purple-500">
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-gray-500 uppercase font-bold">
              Bancos / Digital
            </p>
            <Smartphone className="text-purple-500 opacity-50" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-purple-700">
            S/ {resumen.ventasDigital.toFixed(2)}
          </h2>
          <p className="text-[10px] text-gray-400 mt-1">Yape, Tarjetas</p>
        </div>

        {/* 4. INGRESOS EXTRA */}
        <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-yellow-500">
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-gray-500 uppercase font-bold">
              Ingresos Extra
            </p>
            <PlusCircle className="text-yellow-500 opacity-50" size={20} />
          </div>
          <h2 className="text-3xl font-bold text-yellow-700">
            S/ {resumen.ingresosExtra.toFixed(2)}
          </h2>
          <p className="text-[10px] text-gray-400 mt-1">Sencillo manual</p>
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
              Caja abierta, esperando movimientos...
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-4">Hora</th>
                <th className="p-4">Cliente / Tipo</th>
                <th className="p-4">Detalle</th>
                <th className="p-4 text-center">Medio</th>
                <th className="p-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movimientos.map((m) => {
                const esPago = m.tipo === "PAGO";
                const esApertura = m.tipo === "APERTURA";

                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    {/* --- AQUÍ ESTÁ LA CORRECCIÓN DE HORA APLICADA --- */}
                    <td className="p-4 font-mono text-gray-500">
                      {new Date(m.fechaRegistro).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        timeZone: "America/Lima",
                      })}
                    </td>
                    {/* ----------------------------------------------- */}

                    <td className="p-4 font-medium text-gray-700">
                      {esApertura ? (
                        <span className="text-gray-800 font-bold bg-gray-200 px-2 py-1 rounded text-xs">
                          APERTURA
                        </span>
                      ) : esPago ? (
                        m.dniCliente
                      ) : (
                        <span className="text-blue-600 font-bold">
                          INGRESO CAJA
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-gray-600">
                      {esApertura ? (
                        <span className="italic text-gray-500">
                          Saldo inicial en caja
                        </span>
                      ) : esPago ? (
                        <>
                          Cuota {m.numeroCuota}{" "}
                          {m.desglose?.mora > 0 && (
                            <span className="text-red-500 text-xs">(Mora)</span>
                          )}
                        </>
                      ) : (
                        m.descripcion
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide ${
                          esApertura
                            ? "bg-gray-100 text-gray-600 border border-gray-300"
                            : m.medioPago === "EFECTIVO" || !esPago
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : "bg-purple-100 text-purple-700 border border-purple-200"
                        }`}
                      >
                        {m.medioPago || "EFECTIVO"}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-gray-800">
                      S/ {Number(esPago ? m.montoTotal : m.monto).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL DE INGRESO DINERO */}
      {modalIngresoOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="bg-green-600 p-4 flex justify-between items-center text-white">
              <h3 className="font-bold">Ingresar Dinero a Caja</h3>
              <button onClick={() => setModalIngresoOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-600 font-medium">
                  Monto a Ingresar
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-3 text-gray-400">
                    S/
                  </span>
                  <input
                    type="number"
                    value={montoIngreso}
                    onChange={(e) => setMontoIngreso(e.target.value)}
                    className="w-full pl-8 p-2 border rounded font-bold text-lg focus:ring-2 ring-green-500 outline-none"
                    placeholder="0.00"
                    step="0.1"
                    max="999999"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 font-medium">
                  Motivo / Descripción
                </label>
                <input
                  type="text"
                  value={descIngreso}
                  onChange={(e) => setDescIngreso(e.target.value)}
                  className="w-full mt-1 p-2 border rounded focus:ring-2 ring-green-500 outline-none"
                  placeholder="Ej. Sencillo para vueltos"
                />
              </div>
              <button
                onClick={ingresarDinero}
                disabled={procesando}
                className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700 transition-colors"
              >
                {procesando ? "Guardando..." : "Confirmar Ingreso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
