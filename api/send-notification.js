export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { titulo, mensaje, url, legajo } = req.body;

  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'Faltan titulo o mensaje' });
  }

  const ONESIGNAL_APP_ID  = '1abf72a7-51ff-49c2-a913-f90da792dd08';
  const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

  if (!ONESIGNAL_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  // os_v2 keys usan "Bearer", las legacy usan "Key"
  const authHeader = ONESIGNAL_API_KEY.startsWith('os_v2')
    ? 'Bearer ' + ONESIGNAL_API_KEY
    : 'Key ' + ONESIGNAL_API_KEY;

  // Si viene legajo → solo ese alumno (external_id)
  // Si no viene legajo → broadcast a todos
  const target = legajo
    ? {
        include_aliases: { external_id: [String(legajo)] },
        target_channel: 'push',
      }
    : {
        included_segments: ['All'],
      };

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        app_id:   ONESIGNAL_APP_ID,
        headings: { en: titulo },
        contents: { en: mensaje },
        url:      url || 'https://ecos-phi-nine.vercel.app',
        ...target,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error:  data.errors?.join(', ') || 'Error OneSignal',
        status: response.status,
        detail: JSON.stringify(data),
      });
    }

    return res.status(200).json({
      ok:         true,
      id:         data.id,
      recipients: data.recipients,
      legajo:     legajo || null,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
