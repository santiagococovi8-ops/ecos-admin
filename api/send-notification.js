/**
 * ══════════════════════════════════════════════════════════════
 * /api/send-notification.js — ECOS JurSoc Push Notifications v2
 * ══════════════════════════════════════════════════════════════
 *
 * Endpoint Vercel para enviar notificaciones push via OneSignal.
 * Soporta:
 *   - Envío MASIVO:     body sin `legajo`    → segmento "Total Subscriptions"
 *   - Envío INDIVIDUAL: body con `legajo`    → alias "external_id" del usuario
 *
 * Variables de entorno requeridas en Vercel:
 *   ONESIGNAL_API_KEY  = REST API Key del panel de OneSignal
 *                        (Settings → Keys & IDs → REST API Key)
 *   ONESIGNAL_APP_ID   = App ID de OneSignal
 *                        (Settings → Keys & IDs → OneSignal App ID)
 *                        Opcional si usás el hardcodeado de fallback.
 *
 * Body JSON esperado:
 *   {
 *     titulo:  string (requerido)
 *     mensaje: string (requerido)
 *     legajo?: string (si viene → envío individual)
 *     url?:    string (URL a abrir al tocar la notificación)
 *     _test?:  boolean (si viene → no enviar a OneSignal, solo validar config)
 *   }
 *
 * Respuesta OK (200):
 *   { id, recipients, errors }
 *
 * Respuesta error (4xx/5xx):
 *   { error: string, details?: any }
 */

const ONESIGNAL_APP_ID_FALLBACK = '1abf72a7-51ff-49c2-a913-f90da792dd08';

export default async function handler(req, res) {
  // ── Solo POST ──
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usá POST.' });
  }

  // ── Leer variables de entorno ──
  const apiKey = process.env.ONESIGNAL_API_KEY;
  const appId  = process.env.ONESIGNAL_APP_ID || ONESIGNAL_APP_ID_FALLBACK;

  if (!apiKey) {
    console.error('[NOTIF] ONESIGNAL_API_KEY no configurada');
    return res.status(500).json({
      error: 'Configuración incompleta: falta ONESIGNAL_API_KEY en variables de entorno de Vercel.',
      hint: 'Vercel Dashboard → Settings → Environment Variables → agregar ONESIGNAL_API_KEY',
    });
  }

  // ── Parsear body ──
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch(e) {
    return res.status(400).json({ error: 'Body JSON inválido: ' + e.message });
  }

  const { titulo, mensaje, legajo, url, _test } = body || {};

  // Validar campos requeridos (excepto en modo test)
  if (!_test) {
    if (!titulo || typeof titulo !== 'string' || !titulo.trim()) {
      return res.status(400).json({ error: 'El campo "titulo" es requerido.' });
    }
    if (!mensaje || typeof mensaje !== 'string' || !mensaje.trim()) {
      return res.status(400).json({ error: 'El campo "mensaje" es requerido.' });
    }
  }

  // ── Modo test: solo validar config ──
  if (_test) {
    return res.status(200).json({
      test: true,
      message: 'Configuración OK. ONESIGNAL_API_KEY detectada.',
      appId,
    });
  }

  // ── Construir payload OneSignal ──
  // Documentación: https://documentation.onesignal.com/reference/create-notification
  const payload = {
    app_id:   appId,
    headings: { en: titulo.trim() },
    contents: { en: mensaje.trim() },
  };

  // URL al abrir la notificación
  if (url && typeof url === 'string' && url.trim()) {
    payload.url = url.trim();
  }

  // Sanitizar legajo para external_id
  // OneSignal external_id solo acepta: letras, números, guion, underscore, punto, arroba
  const sanitizeLegajo = (raw) => {
    if (!raw) return null;
    return String(raw).trim().replace(/[^a-zA-Z0-9_\-\.@]/g, '_');
  };

  const legajoId = sanitizeLegajo(legajo);

  if (legajoId) {
    // ── ENVÍO INDIVIDUAL (via external_id / alias) ──
    // Sintaxis nueva de OneSignal v12+ (include_aliases)
    console.log('[NOTIF] Envío individual → legajo:', legajoId);
    payload.include_aliases = {
      external_id: [legajoId],
    };
    payload.target_channel = 'push';
  } else {
    // ── ENVÍO MASIVO (segmento "Total Subscriptions") ──
    console.log('[NOTIF] Envío masivo → Total Subscriptions');
    payload.included_segments = ['Total Subscriptions'];
  }

  // ── Llamar a la API de OneSignal ──
  console.log('[NOTIF] Payload OneSignal:', JSON.stringify(payload));

  let onesignalRes;
  try {
    onesignalRes = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Key ' + apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch(fetchErr) {
    console.error('[NOTIF] Error de red al contactar OneSignal:', fetchErr.message);
    return res.status(502).json({
      error: 'No se pudo contactar la API de OneSignal: ' + fetchErr.message,
    });
  }

  const onesignalText = await onesignalRes.text();
  let onesignalData;
  try {
    onesignalData = JSON.parse(onesignalText);
  } catch(e) {
    onesignalData = { rawText: onesignalText };
  }

  console.log('[NOTIF] OneSignal response HTTP', onesignalRes.status, '→', JSON.stringify(onesignalData));

  // ── Manejar respuesta de OneSignal ──
  if (!onesignalRes.ok) {
    const errMsg = onesignalData?.errors?.[0]
      || onesignalData?.error
      || onesignalData?.message
      || 'Error de OneSignal HTTP ' + onesignalRes.status;
    return res.status(502).json({
      error: errMsg,
      details: onesignalData,
      httpStatus: onesignalRes.status,
    });
  }

  // ── Éxito ──
  return res.status(200).json({
    id:         onesignalData.id         || null,
    recipients: onesignalData.recipients || 0,
    errors:     onesignalData.errors     || [],
    raw:        onesignalData,
  });
}
