const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const store = getStore({ name: 'content', consistency: 'strong' });

  // Public read
  if (event.httpMethod === 'GET') {
    const data = await store.get('audio', { type: 'json' }).catch(() => null);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(data || { entries: [] }),
    };
  }

  // Password-protected actions
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { password, action, entries } = body;

    const envSet = !!process.env.ADMIN_PASSWORD;
    const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
    if (!password || password.trim() !== envPassword) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized', env_set: envSet }) };
    }

    // Verify-only — just confirms the password is correct and returns current entries
    if (action === 'verify') {
      const data = await store.get('audio', { type: 'json' }).catch(() => null);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, ...(data || { entries: [] }) }) };
    }

    if (!Array.isArray(entries)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'entries must be an array' }) };
    }

    await store.setJSON('audio', { entries });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
