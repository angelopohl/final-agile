"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf"; // Asegúrate de tener instalado: npm install jspdf

export default function DetallePrestamoPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();

  const [prestamo, setPrestamo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState(null);
  const [montoPagar, setMontoPagar] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [medioPago, setMedioPago] = useState("EFECTIVO");
  const [procesando, setProcesando] = useState(false);

  const fetchPrestamo = async () => {
    try {
      const res = await fetch("/api/prestamos");
      const data = await res.json();
      const encontrado = data.find((p) => p.id === id);
      setPrestamo(encontrado || null);
    } catch (e) {
      console.error("Error cargando préstamo:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchPrestamo();
  }, [id]);

  const abrirModalPago = (cuota) => {
    setCuotaSeleccionada(cuota);
    // Calculamos lo pendiente (Capital total - Capital ya pagado)
    // NOTA: Tu backend maneja mora aparte, aquí sugerimos el capital pendiente + mora pendiente si quisieras mostrarlo,
    // pero para mantenerlo simple y seguro, sugerimos el capital restante.
    const capitalPendiente = cuota.amount - (cuota.capitalPagado || 0);

    // Si quisieras sugerir también la mora pendiente (opcional visualmente):
    // const moraPendiente = (cuota.moraCalculadaTotal || 0) - (cuota.moraPagada || 0);
    // const totalSugerido = capitalPendiente + moraPendiente;

    setMontoPagar(capitalPendiente.toFixed(2));
    setMontoRecibido("");
    setMedioPago("EFECTIVO");
    setModalPagoOpen(true);
  };

  // --- LÓGICA MOVIDA AL FRONTEND PARA DESCARGA DIRECTA ---
  const generarComprobante = (cuotaData) => {
    try {
      const doc = new jsPDF();
      const fechaHoy = new Date().toLocaleDateString();

      // Datos reales pagados (tu backend guarda esto)
      const capitalPagado = cuotaData.capitalPagado || 0;
      const moraPagada = cuotaData.moraPagada || 0;
      const totalAbonado = capitalPagado + moraPagada;

      // Saldo pendiente (Capital original - capital pagado)
      const saldoCapital = cuotaData.amount - capitalPagado;

      // Encabezado
      doc.setFontSize(18);
      doc.text("Comprobante de Pago", 14, 20);

      doc.setFontSize(12);
      doc.text("Emisor: Confecciones Darkys", 14, 30);
      doc.text("RUC: 12345678901", 14, 40);
      doc.text("Dirección: Av. Ejemplo 123", 14, 50);

      // Cliente
      doc.text(`Cliente DNI: ${prestamo.dniCliente}`, 14, 60);

      // Detalles del préstamo
      doc.text(`Préstamo ID: ${prestamo.id}`, 14, 80);
      const fechaPago = cuotaData.fechaUltimoPago
        ? new Date(cuotaData.fechaUltimoPago).toLocaleDateString()
        : fechaHoy;
      doc.text(`Fecha de Último Pago: ${fechaPago}`, 14, 90);

      // Detalle de la transacción
      doc.line(14, 100, 200, 100); // Línea separadora
      doc.text("Descripción:", 14, 110);
      doc.text(`Pago Cuota N° ${cuotaData.num}`, 14, 120);

      // Desglose de montos
      doc.setFontSize(11);
      doc.text(`Capital Amortizado: S/ ${capitalPagado.toFixed(2)}`, 14, 130);
      if (moraPagada > 0) {
        doc.text(`Mora Pagada: S/ ${moraPagada.toFixed(2)}`, 14, 140);
      }

      // Total Pagado
      doc.setFontSize(16);
      doc.text(`Total Abonado: S/ ${totalAbonado.toFixed(2)}`, 14, 155);

      // Mostrar saldo pendiente si existe
      if (saldoCapital > 0.01) {
        doc.setFontSize(12);
        doc.setTextColor(200, 0, 0); // Rojo
        doc.text(
          `Saldo Capital Pendiente: S/ ${saldoCapital.toFixed(2)}`,
          14,
          165
        );
      } else {
        doc.setFontSize(12);
        doc.setTextColor(0, 128, 0); // Verde
        doc.text(`¡Cuota Cancelada!`, 14, 165);
      }
      doc.setTextColor(0, 0, 0); // Reset color

      // Pie de página
      doc.setFontSize(10);
      doc.text("Gracias por su cumplimiento.", 14, 180);
      doc.text("www.confeccionesdarkys.com", 14, 190);

      doc.save(`comprobante_cuota_${cuotaData.num}_${prestamo.dniCliente}.pdf`);
    } catch (error) {
      console.error("Error generando el comprobante:", error);
      alert("Error al generar el PDF.");
    }
  };

  const confirmarPago = async () => {
    const montoNum = parseFloat(montoPagar);

    if (!montoNum || montoNum <= 0) {
      alert("Monto a pagar inválido");
      return;
    }

    if (!cuotaSeleccionada || !prestamo) {
      alert("No hay cuota seleccionada");
      return;
    }

    // --- VALIDACIÓN DE EXCESO DE PAGO (RESTAURADA) ---
    // Calculamos cuánto capital falta. Nota: Tu backend puede cobrar mora extra,
    // así que permitimos un pago mayor si hay mora, pero advertimos si es excesivo.
    const capitalPendiente =
      cuotaSeleccionada.amount - (cuotaSeleccionada.capitalPagado || 0);
    // Estimación simple de mora para validar (opcional)
    // Si el usuario intenta pagar 1000 y la deuda es 100, alertamos.
    // Usamos un margen de seguridad amplio por si hay mora acumulada.
    if (montoNum > capitalPendiente * 2 + 50 && capitalPendiente > 0) {
      // Esta es una validación de seguridad básica para evitar errores de tipeo grandes
      if (
        !confirm(
          `El monto S/ ${montoNum} parece muy alto comparado con el capital pendiente (S/ ${capitalPendiente.toFixed(
            2
          )}). ¿Desea continuar?`
        )
      ) {
        return;
      }
    }

    setProcesando(true);

    try {
      if (medioPago === "EFECTIVO") {
        const recibidoNum = parseFloat(montoRecibido || "0");

        // 1. Validar que se haya ingresado algo
        if (!recibidoNum || recibidoNum <= 0) {
          alert("Ingrese el monto recibido en efectivo");
          setProcesando(false);
          return;
        }

        // 2. ✅ NUEVA VALIDACIÓN SOLICITADA: Recibido >= A Pagar
        if (recibidoNum < montoNum) {
          alert(
            `Error: El monto recibido (S/ ${recibidoNum.toFixed(
              2
            )}) es menor que el monto a pagar (S/ ${montoNum.toFixed(
              2
            )}). Debe ser igual o mayor.`
          );
          setProcesando(false);
          return; // Detiene la ejecución
        }

        const res = await fetch("/api/pagos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prestamoId: prestamo.id,
            numeroCuota: cuotaSeleccionada.num,
            montoPagado: montoNum,
            medioPago: "EFECTIVO",
            // montoRecibido: recibidoNum, // El backend no usa esto para lógica, pero podrías enviarlo si lo guardas
          }),
        });

        const data = await res.json();

        if (res.ok) {
          alert("Pago registrado correctamente.");
          setModalPagoOpen(false);
          fetchPrestamo(); // Recarga los datos para ver el nuevo estado
        } else {
          alert("Error: " + data.message);
        }
        setProcesando(false);
        return;
      }

      // Lógica para BILLETERA y TARJETA
      if (medioPago === "BILLETERA" || medioPago === "TARJETA") {
        const res = await fetch("/api/flow/orden", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prestamoId: prestamo.id,
            numeroCuota: cuotaSeleccionada.num,
            monto: montoNum,
            billetera: medioPago === "BILLETERA",
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.urlPago) {
          alert(`Error Flow: ${data.error || "No se generó link de pago"}`);
          setProcesando(false);
          return;
        }

        window.location.href = data.urlPago;
        return;
      }
    } catch (error) {
      console.error("Error en confirmarPago:", error);
      alert("Error de conexión al registrar el pago.");
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
      <h1 className="text-2xl font-bold">
        Cobranza - DNI {prestamo.dniCliente}
      </h1>

      {/* Resumen Superior */}
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

      {/* Tabla de Cuotas */}
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100 font-bold">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Vence</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 text-right">Abonado</th>{" "}
              {/* Columna Agregada */}
              <th className="p-3 text-center">Estado</th>
              <th className="p-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {prestamo.cronograma.map((c) => {
              // Calculamos lo abonado sumando capital + mora pagada
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
                    {/* BOTÓN RECIBO: Si hay algo abonado (> 0), mostramos el botón */}
                    {abonadoTotal > 0 && (
                      <button
                        onClick={() => generarComprobante(c)}
                        className="text-gray-600 hover:text-gray-900 p-1 border rounded hover:bg-gray-50"
                        title="Descargar Comprobante"
                      >
                        {/* Icono simple de documento */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                          />
                        </svg>
                      </button>
                    )}

                    {/* BOTÓN COBRAR: Si NO está pagado, mostramos el botón de acción */}
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

      {/* Modal de Pago */}
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
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <label>Monto a pagar</label>
                  {/* Mostramos cuánto falta de capital para guiar al usuario */}
                  <span>
                    Pendiente Capital: S/{" "}
                    {(
                      cuotaSeleccionada.amount -
                      (cuotaSeleccionada.capitalPagado || 0)
                    ).toFixed(2)}
                  </span>
                </div>
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
                  <p className="text-gray-500 text-xs">Monto recibido</p>
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
                  Yape
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
