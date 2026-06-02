/**
 * /api/send-notification.js — ECOS JurSoc Push Notifications v2
 *
 * Variables de entorno en Vercel:
 *   ONESIGNAL_API_KEY  = REST API Key (Settings → Keys & IDs → REST API Key)
 *   ONESIGNAL_APP_ID   = App ID (opcional, hay fallback hardcodeado)
 */

const ONESIGNAL_APP_ID_FALLBACK = '1abf72a7-51ff-49c2-a913-f90da792dd08';

export default async function handler(req, res) {
  // CORS headers (por si acaso)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usá POST.' });
  }

  const apiKey = process.env.ONESIGNAL_API_KEY;
  const appId  = process.env.ONESIGNAL_APP_ID || ONESIGNAL_APP_ID_FALLBACK;

  // ── Modo debug: muestra config sin enviar ──
  // Llamar con { _debug: true } para ver qué variables hay
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch(e) {
    return res.status(400).json({ error: 'Body JSON inválido: ' + e.message });
  }

  if (body?._debug) {
    return res.status(200).json({
      debug: true,
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.slice(0, 12) + '...' : null,
      appId,
      nodeVersion: process.version,
    });
  }

  // ── Modo test: solo valida config ──
  if (body?._test) {
    return res.status(200).json({
      test: true,
      message: 'Config OK',
      apiKeyPresent: !!apiKey,
      appId,
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      error: 'ONESIGNAL_API_KEY no configurada en Vercel Environment Variables.',
    });
  }

  const { titulo, mensaje, legajo, url } = body || {};

  if (!titulo?.trim()) return res.status(400).json({ error: 'titulo requerido' });
  if (!mensaje?.trim()) return res.status(400).json({ error: 'mensaje requerido' });

  // Sanitizar legajo
  const sanitizeLegajo = (raw) =>
    raw ? String(raw).trim().replace(/[^a-zA-Z0-9_\-\.@]/g, '_') : null;
  const legajoId = sanitizeLegajo(legajo);

  // Construir payload
  const payload = {
    app_id:   appId,
    headings: { en: titulo.trim() },
    contents: { en: mensaje.trim() },
  };

  if (url?.trim()) payload.url = url.trim();

  if (legajoId) {
    // Envío individual — sintaxis v12+ con include_aliases
    payload.include_aliases    = { external_id: [legajoId] };
    payload.target_channel     = 'push';
    console.log('[NOTIF] Individual → legajo:', legajoId);
  } else {
    // Envío masivo — probar los dos nombres de segmento posibles
    // OneSignal puede llamarlo "Total Subscriptions" o "Subscribed Users"
    payload.included_segments  = ['Total Subscriptions'];
    console.log('[NOTIF] Masivo → Total Subscriptions');
  }

  console.log('[NOTIF] Payload:', JSON.stringify(payload));

  let onesignalRes, onesignalData;
  try {
    onesignalRes = await fetch('https://onesignal.com/api/v1/notifications', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Key ' + apiKey,
      },
      body: JSON.stringify(payload),
    });
    const text = await onesignalRes.text();
    try { onesignalData = JSON.parse(text); }
    catch(e) { onesignalData = { rawText: text }; }
  } catch(fetchErr) {
    return res.status(502).json({ error: 'Error de red: ' + fetchErr.message });
  }

  console.log('[NOTIF] OneSignal HTTP', onesignalRes.status, JSON.stringify(onesignalData));

  // Si OneSignal devuelve error
  if (!onesignalRes.ok) {
    return res.status(502).json({
      error:      onesignalData?.errors?.[0] || 'Error OneSignal ' + onesignalRes.status,
      details:    onesignalData,
      httpStatus: onesignalRes.status,
    });
  }

  // Éxito — devolver TODO para diagnóstico desde el admin
  return res.status(200).json({
    id:         onesignalData.id              || null,
    recipients: onesignalData.recipients      ?? null,
    errors:     onesignalData.errors          || [],
    external_id_errors: onesignalData.external_id_errors || null,
    raw:        onesignalData,
  });
}
