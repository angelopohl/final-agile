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
    const capitalPendiente = cuota.amount - (cuota.capitalPagado || 0);
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

      // Encabezado
      doc.setFontSize(18);
      doc.text("Comprobante de Pago", 14, 20);

      doc.setFontSize(12);
      doc.text("Emisor: Confecciones Darkys", 14, 30);
      doc.text("RUC: 12345678901", 14, 40);
      doc.text("Dirección: Av. Ejemplo 123", 14, 50);

      // Cliente (Usamos datos del estado prestamo)
      doc.text(`Cliente DNI: ${prestamo.dniCliente}`, 14, 60);
      // Si tienes el nombre del cliente en el objeto prestamo, agrégalo aquí:
      // doc.text(`Nombre: ${prestamo.nombreCliente}`, 14, 70);

      // Detalles del préstamo
      doc.text(`Préstamo ID: ${prestamo.id}`, 14, 80);
      doc.text(`Fecha de emisión: ${fechaHoy}`, 14, 90);

      // Detalle de la transacción
      doc.line(14, 100, 200, 100); // Línea separadora
      doc.text("Descripción:", 14, 110);
      doc.text(`Pago Cuota N° ${cuotaData.num}`, 14, 120);

      // Intentamos recuperar la fecha de pago si existe, sino la de hoy
      const fechaPago = cuotaData.fechaPago
        ? new Date(cuotaData.fechaPago).toLocaleDateString()
        : fechaHoy;
      doc.text(`Fecha de Pago: ${fechaPago}`, 14, 130);

      // Total
      doc.setFontSize(16);
      doc.text(`Monto Pagado: S/ ${cuotaData.amount.toFixed(2)}`, 14, 150);

      // Pie de página
      doc.setFontSize(10);
      doc.text("Gracias por su cumplimiento.", 14, 170);
      doc.text("www.confeccionesdarkys.com", 14, 180);

      // Descargar el archivo PDF directamente
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

    setProcesando(true);

    try {
      if (medioPago === "EFECTIVO") {
        const recibidoNum = parseFloat(montoRecibido || "0");
        if (!recibidoNum || recibidoNum <= 0) {
          alert("Ingrese el monto recibido en efectivo");
          setProcesando(false);
          return;
        }

        const res = await fetch("/api/pagos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prestamoId: prestamo.id,
            numeroCuota: cuotaSeleccionada.num,
            montoPagado: montoNum,
            medioPago: "EFECTIVO",
            montoRecibido: recibidoNum,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          alert("Pago en efectivo registrado.");
          setModalPagoOpen(false);
          fetchPrestamo();
        } else {
          alert("Error: " + data.message);
        }
        setProcesando(false);
        return;
      }

      // Lógica para BILLETERA y TARJETA (Se mantiene igual)
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
              <th className="p-3 text-center">Estado</th>
              <th className="p-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {prestamo.cronograma.map((c) => (
              <tr key={c.num} className="border-t">
                <td className="p-3">{c.num}</td>
                <td className="p-3">{formatearFecha(c.dueDate)}</td>
                <td className="p-3 text-right">S/ {c.amount.toFixed(2)}</td>
                <td className="p-3 text-center">
                  {c.estado === "PAGADO" ? (
                    <span className="text-green-600 font-bold text-xs">
                      PAGADO
                    </span>
                  ) : c.estado === "PARCIAL" ? (
                    <span className="text-yellow-700 font-bold text-xs">
                      PARCIAL
                    </span>
                  ) : (
                    <span className="text-gray-600 text-xs">PENDIENTE</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {/* LÓGICA DEL BOTÓN MODIFICADA */}
                  {c.estado === "PAGADO" ? (
                    <button
                      onClick={() => generarComprobante(c)}
                      className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1 rounded text-xs flex items-center gap-1 mx-auto"
                      title="Descargar Comprobante"
                    >
                      {/* Icono de documento/impresora */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-3 h-3"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                        />
                      </svg>
                      Recibo
                    </button>
                  ) : (
                    <button
                      onClick={() => abrirModalPago(c)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                    >
                      Cobrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de Pago (Sin cambios importantes) */}
      {modalPagoOpen && cuotaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="bg-blue-600 p-4 text-white font-bold flex justify-between">
              <span>Cobrar cuota {cuotaSeleccionada.num}</span>
              <button onClick={() => setModalPagoOpen(false)}>X</button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-gray-500 text-xs">Monto a pagar</p>
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
