export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { titulo, mensaje, url } = req.body;

  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'Faltan titulo o mensaje' });
  }

  const ONESIGNAL_APP_ID  = '1abf72a7-51ff-49c2-a913-f90da792dd08';
  const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

  if (!ONESIGNAL_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Key ' + ONESIGNAL_API_KEY,
      },
      body: JSON.stringify({
        app_id:            ONESIGNAL_APP_ID,
        included_segments: ['All'],
        headings:          { en: titulo },
        contents:          { en: mensaje },
        url:               url || 'https://ecos-phi-nine.vercel.app',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.errors?.join(', ') || 'Error OneSignal' });
    }

    return res.status(200).json({ ok: true, id: data.id, recipients: data.recipients });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
