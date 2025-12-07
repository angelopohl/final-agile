const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Inicializar Firebase Admin
initializeApp();
const db = getFirestore();

/**
 * Webhook para recibir notificaciones desde MacroDroid
 * Guarda cada pago Yape en la colección "pagos_yape"
 */
exports.yapeWebhook = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const { monto, mensaje, timestamp } = req.body || {};

    logger.info("[YAPE-WEBHOOK] Body recibido:", req.body);

    if (!monto || !mensaje || !timestamp) {
      res.status(400).json({
        ok: false,
        error: "Datos incompletos (monto, mensaje, timestamp)",
      });
      return;
    }

    const montoNum = Number(monto);
    if (Number.isNaN(montoNum)) {
      res.status(400).json({
        ok: false,
        error: "Monto inválido",
      });
      return;
    }

    const ref = db.collection("pagos_yape").doc();

    await ref.set({
      id: ref.id,
      monto: montoNum,
      mensaje,
      timestamp,
      procesado: false,
      creadoEn: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error("[YAPE-WEBHOOK] Error:", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Error interno",
    });
  }
});
