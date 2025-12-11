"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { generarPDFCronograma } from "@/lib/pdfGenerator";

export default function DetallePrestamoPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();

  const [prestamo, setPrestamo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState(null);

  // Estados del formulario de pago
  const [montoPagar, setMontoPagar] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [medioPago, setMedioPago] = useState("EFECTIVO");
  const [procesando, setProcesando] = useState(false);

  // --- FUNCIÓN DE REDONDEO ---
  const redondearEfectivo = (valor) => {
    return (Math.round(valor * 10) / 10).toFixed(2);
  };

  const fetchPrestamo = async () => {
    try {
      const res = await fetch("/api/prestamos");
      const data = await res.json();
      const encontrado = data.find((p) => p.id === id);

      if (encontrado) {
        if (!encontrado.nombreCliente) {
          try {
            const clienteRes = await fetch("/api/cliente/verificar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dni: encontrado.dniCliente }),
            });
            if (clienteRes.ok) {
              const cd = await clienteRes.json();
              const n = `${cd.apellidoPaterno || ""} ${
                cd.apellidoMaterno || ""
              } ${cd.nombres || ""}`;
              encontrado.nombreCliente = n.trim();
            }
          } catch (e) {
            console.warn("Error recuperando nombre", e);
          }
        }
        setPrestamo(encontrado);
      } else {
        setPrestamo(null);
      }
    } catch (e) {
      console.error("Error cargando préstamo:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchPrestamo();

      // Verificar si viene de un pago exitoso (Flow redirecciona aquí)
      const pagoExitoso = searchParams.get("pagoExitoso");
      const numeroCuotaPagada = searchParams.get("cuota");

      if (pagoExitoso === "true" && numeroCuotaPagada && prestamo) {
        const cuotaPagada = prestamo.cronograma.find(
          (c) => c.num === parseInt(numeroCuotaPagada)
        );
        if (cuotaPagada) {
          const esRuc =
            prestamo.dniCliente && prestamo.dniCliente.length === 11;
          if (esRuc) {
            generarFactura(cuotaPagada);
          } else {
            generarComprobante(cuotaPagada);
          }
        }
      }
    }
  }, [id, searchParams, prestamo]);

  // Actualizar monto al cambiar medio de pago
  useEffect(() => {
    if (cuotaSeleccionada) {
      const desglose = calcularDesglosePago(cuotaSeleccionada);
      const totalExacto = desglose.total;

      if (medioPago === "EFECTIVO") {
        setMontoPagar(redondearEfectivo(totalExacto));
      } else {
        setMontoPagar(totalExacto.toFixed(2));
      }
    }
  }, [medioPago]);

  // --- CÁLCULO DE MORA ---
  const calcularDesglosePago = (cuota) => {
    if (!cuota) return { capital: 0, mora: 0, total: 0, diasAtraso: 0 };

    const capitalPagado = Number(cuota.capitalPagado || 0);
    const capitalPendiente = Number(cuota.amount) - capitalPagado;
    const moraPagada = Number(cuota.moraPagada || 0);
    const moraCongelada = Number(cuota.moraCongelada || 0);

    const fechaVencimiento = new Date(cuota.dueDate);
    const hoy = new Date();
    fechaVencimiento.setHours(0, 0, 0, 0);
    hoy.setHours(0, 0, 0, 0);

    const msPorDia = 1000 * 60 * 60 * 24;
    const diasAtraso = Math.ceil((hoy - fechaVencimiento) / msPorDia);

    let moraActiva = 0;
    if (capitalPendiente > 0.01 && diasAtraso > 0) {
      const TASA_MORA = 0.01;
      moraActiva = Number(cuota.amount) * TASA_MORA;
    }

    const moraTotalGenerada = moraActiva + moraCongelada;
    const deudaMora = Math.max(0, moraTotalGenerada - moraPagada);

    return {
      capital: capitalPendiente,
      mora: deudaMora,
      total: capitalPendiente + deudaMora,
      diasAtraso: diasAtraso > 0 ? diasAtraso : 0,
      moraSnapshot: moraTotalGenerada,
    };
  };

  const abrirModalPago = (cuota) => {
    setCuotaSeleccionada(cuota);
    const desglose = calcularDesglosePago(cuota);
    setMontoPagar(redondearEfectivo(desglose.total));
    setMontoRecibido("");
    setMedioPago("EFECTIVO");
    setModalPagoOpen(true);
  };

  // --- GENERACIÓN DE PDFS (LLAMADAS AL BACKEND) ---
  const generarComprobante = async (cuotaData) => {
    try {
      const res = await fetch("/api/comprobantes/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prestamoId: prestamo.id,
          numeroCuota: cuotaData.num,
          monto: (cuotaData.capitalPagado || 0) + (cuotaData.moraPagada || 0),
          medioPago: cuotaData.medioPago || "EFECTIVO",
          cliente: {
            nombre: prestamo.nombreCliente || "Cliente",
            numero_documento: prestamo.dniCliente,
            direccion: "-",
          },
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `comprobante_${prestamo.id}_${cuotaData.num}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const errData = await res.json();
        alert("Error: " + (errData.error || "Desconocido"));
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión.");
    }
  };

  const generarFactura = async (cuotaData) => {
    try {
      const res = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prestamoId: prestamo.id,
          numeroCuota: cuotaData.num,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `factura_${prestamo.id}_${cuotaData.num}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const errData = await res.json();
        alert("Error factura: " + (errData.error || "Desconocido"));
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión.");
    }
  };

  // --- CONFIRMACIÓN DEL PAGO ---
  const confirmarPago = async () => {
    const montoNum = parseFloat(montoPagar);

    if (!montoNum || montoNum <= 0) return alert("Monto inválido");
    if (!cuotaSeleccionada || !prestamo) return alert("Error de selección");

    const desglose = calcularDesglosePago(cuotaSeleccionada);

    if (montoNum > desglose.total + 0.1) {
      if (
        !confirm(
          `El monto (S/ ${montoNum}) es mayor al total calculado. ¿Continuar?`
        )
      )
        return;
    }

    setProcesando(true);

    const payload = {
      prestamoId: prestamo.id,
      numeroCuota: cuotaSeleccionada.num,
      montoPagado: montoNum,
      moraCalculadaSnapshot: desglose.moraSnapshot,
    };

    try {
      // 1. PAGO EFECTIVO
      if (medioPago === "EFECTIVO") {
        const recibidoNum = parseFloat(montoRecibido || "0");
        if (!recibidoNum || recibidoNum <= 0) {
          setProcesando(false);
          return alert("Ingrese el monto recibido");
        }
        if (recibidoNum < montoNum) {
          setProcesando(false);
          return alert("Recibido insuficiente");
        }

        const res = await fetch("/api/pagos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            medioPago: "EFECTIVO",
            montoRecibido: recibidoNum,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          alert("Pago registrado correctamente.");
          setModalPagoOpen(false);

          // Generar doc
          const esRuc =
            prestamo.dniCliente && prestamo.dniCliente.length === 11;
          if (esRuc) await generarFactura(cuotaSeleccionada);
          else await generarComprobante(cuotaSeleccionada);

          await fetchPrestamo();
        } else {
          alert("Error: " + data.message);
        }
        setProcesando(false);
        return;
      }

      // 2. PAGO ONLINE (YAPE / TARJETA) - AQUÍ ESTÁ EL CAMBIO
      if (medioPago === "BILLETERA" || medioPago === "TARJETA") {
        const res = await fetch("/api/flow/orden", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            monto: montoNum,
            billetera: medioPago === "BILLETERA",
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.urlPago) {
          alert(`Error Flow: ${data.error || "No se generó link"}`);
          setProcesando(false);
          return;
        }

        // --- CAMBIO: ABRIR EN NUEVA PESTAÑA ---
        window.open(data.urlPago, "_blank");

        setModalPagoOpen(false);
        setProcesando(false);

        // Aviso opcional para que el usuario sepa qué pasó
        alert(
          "La pasarela de pago se ha abierto en otra pestaña. Cuando finalices el pago, recarga esta página para ver la actualización."
        );

        return;
      }
    } catch (error) {
      console.error("Error confirmarPago:", error);
      alert("Error de conexión.");
    } finally {
      setProcesando(false);
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "-";
    const d = new Date(fecha);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  };

  const calcularVuelto = () => {
    const recibido = parseFloat(montoRecibido || "0");
    const pagar = parseFloat(montoPagar || "0");
    if (!recibido || !pagar) return "0.00";
    const diff = recibido - pagar;
    return diff > 0 ? diff.toFixed(2) : "0.00";
  };

  if (loading) return <p className="p-8 text-center">Cargando...</p>;
  if (!prestamo)
    return (
      <p className="p-8 text-center text-red-500">Préstamo no encontrado</p>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          Cobranza - DNI {prestamo.dniCliente}
        </h1>
        <button
          onClick={() => generarPDFCronograma(prestamo)}
          className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm flex items-center gap-2"
        >
          📄 Cronograma Completo
        </button>
      </div>

      {prestamo.nombreCliente && (
        <p className="text-gray-600 font-medium -mt-4">
          Cliente: {prestamo.nombreCliente}
        </p>
      )}

      <div className="bg-white rounded shadow p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Monto solicitado</p>
          <p className="font-bold">S/ {prestamo.montoSolicitado.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-500">Total a pagar</p>
          <p className="font-bold text-blue-600">
            S/ {prestamo.montoTotalPagar.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Intereses</p>
          <p className="font-bold text-red-600">
            S/ {prestamo.totalIntereses.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Estado</p>
          <p className="font-bold">{prestamo.estado}</p>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100 font-bold">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Vence</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 text-right">Abonado</th>
              <th className="p-3 text-center">Estado</th>
              <th className="p-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {prestamo.cronograma.map((c) => {
              const abonadoTotal = (c.capitalPagado || 0) + (c.moraPagada || 0);
              return (
                <tr key={c.num} className="border-t">
                  <td className="p-3">{c.num}</td>
                  <td className="p-3">{formatearFecha(c.dueDate)}</td>
                  <td className="p-3 text-right">S/ {c.amount.toFixed(2)}</td>
                  <td className="p-3 text-right font-medium text-gray-700">
                    S/ {abonadoTotal.toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    {c.estado === "PAGADO" ? (
                      <span className="text-green-600 font-bold text-xs bg-green-100 px-2 py-1 rounded">
                        PAGADO
                      </span>
                    ) : c.estado === "PARCIAL" ? (
                      <span className="text-yellow-700 font-bold text-xs bg-yellow-100 px-2 py-1 rounded">
                        PARCIAL
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs bg-gray-100 px-2 py-1 rounded">
                        PENDIENTE
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center flex justify-center gap-2">
                    {abonadoTotal > 0 && (
                      <button
                        onClick={() => {
                          const esRuc =
                            prestamo.dniCliente &&
                            prestamo.dniCliente.length === 11;
                          if (esRuc) generarFactura(c);
                          else generarComprobante(c);
                        }}
                        className="text-gray-600 hover:text-gray-900 p-1 border rounded hover:bg-gray-50"
                        title="Descargar Documento"
                      >
                        📄
                      </button>
                    )}
                    {c.estado !== "PAGADO" && (
                      <button
                        onClick={() => abrirModalPago(c)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                      >
                        {c.estado === "PARCIAL" ? "Completar" : "Cobrar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalPagoOpen && cuotaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="bg-blue-600 p-4 text-white font-bold flex justify-between">
              <span>
                {cuotaSeleccionada.estado === "PARCIAL"
                  ? "Completar Cuota"
                  : "Cobrar Cuota"}{" "}
                {cuotaSeleccionada.num}
              </span>
              <button onClick={() => setModalPagoOpen(false)}>X</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 p-3 rounded border text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Capital Pendiente:</span>
                  <span>
                    S/{" "}
                    {calcularDesglosePago(cuotaSeleccionada).capital.toFixed(2)}
                  </span>
                </div>
                {calcularDesglosePago(cuotaSeleccionada).mora > 0 && (
                  <div className="flex justify-between text-red-600 font-bold">
                    <span>+ Mora Total:</span>
                    <span>
                      S/{" "}
                      {calcularDesglosePago(cuotaSeleccionada).mora.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t pt-1 flex justify-between font-bold text-lg text-gray-800">
                  <span>Total Exacto:</span>
                  <span>
                    S/{" "}
                    {calcularDesglosePago(cuotaSeleccionada).total.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Monto a Pagar{" "}
                  {medioPago === "EFECTIVO" ? "(Redondeado)" : "(Exacto)"}
                </label>
                <input
                  type="number"
                  value={montoPagar}
                  onChange={(e) => setMontoPagar(e.target.value)}
                  className="w-full border p-2 rounded text-lg font-bold"
                  step="0.01"
                />
              </div>

              {medioPago === "EFECTIVO" && (
                <div>
                  <p className="text-gray-500 text-xs">
                    Monto recibido (Efectivo)
                  </p>
                  <input
                    type="number"
                    value={montoRecibido}
                    onChange={(e) => setMontoRecibido(e.target.value)}
                    className="w-full border p-2 rounded text-lg"
                    step="0.01"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Vuelto: S/ {calcularVuelto()}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setMedioPago("EFECTIVO")}
                  className={`p-2 border rounded text-xs ${
                    medioPago === "EFECTIVO"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  Efectivo
                </button>
                <button
                  onClick={() => setMedioPago("BILLETERA")}
                  className={`p-2 border rounded text-xs ${
                    medioPago === "BILLETERA"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  Billetera Digital
                </button>
                <button
                  onClick={() => setMedioPago("TARJETA")}
                  className={`p-2 border rounded text-xs ${
                    medioPago === "TARJETA"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-50 text-gray-700"
                  }`}
                >
                  Tarjeta
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setModalPagoOpen(false)}
                  className="flex-1 border p-2 rounded"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarPago}
                  disabled={procesando}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white p-2 rounded font-bold"
                >
                  {procesando ? "Procesando..." : "Ir a pagar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
