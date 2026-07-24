
// Vercel Serverless Function — proxy API to backend server
const BACKEND = 'http://159.75.27.216:8080';

export default async function handler(req) {
  const url = new URL(req.url);
  const target = BACKEND + url.pathname + url.search;
  
  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.headers.get('content-type') || 'application/json',
        ...(req.headers.get('authorization') ? { 'Authorization': req.headers.get('authorization') } : {}),
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    });
    
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Backend unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  runtime: 'edge',
};
