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

  // Password-protected write
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { password, entries } = body;

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    if (!Array.isArray(entries)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'entries must be an array' }) };
    }

    await store.setJSON('audio', { entries });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
