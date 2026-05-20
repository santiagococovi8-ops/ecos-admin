// api/send-notification.js — Vercel Serverless Function
// Notificaciones push via OneSignal REST API v1.
// - Con `legajo` → solo ese alumno (external_id)
// - Sin `legajo` → broadcast a todos

export default async function handler(req, res) {
  // CORS — permite llamadas desde el admin (cualquier origen)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { titulo, mensaje, legajo } = req.body || {};

  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'titulo y mensaje son requeridos' });
  }

  const APP_ID  = process.env.ONESIGNAL_APP_ID;
  const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

  if (!APP_ID || !API_KEY) {
    console.error('Faltan variables de entorno: ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY');
    return res.status(500).json({ error: 'Configuración de servidor incompleta' });
  }

  // Target: usuario específico o broadcast
  const target = legajo
    ? {
        include_aliases: { external_id: [String(legajo)] },
        target_channel: 'push',
      }
    : {
        included_segments: ['All'],
      };

  const payload = {
    app_id: APP_ID,
    headings: { en: titulo, es: titulo },
    contents: { en: mensaje, es: mensaje },
    ...target,
  };

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OneSignal error:', data);
      return res.status(response.status).json({
        error: data?.errors?.[0] || 'Error al enviar notificación',
        detail: data,
      });
    }

    return res.status(200).json({
      id:         data.id,
      recipients: data.recipients ?? 0,
      legajo:     legajo || null,
    });

  } catch (err) {
    console.error('Error llamando a OneSignal:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
