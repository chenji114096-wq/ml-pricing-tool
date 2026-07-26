// Vercel Edge Function — proxy /api/* to backend server
const BACKEND = 'http://159.75.27.216:80/precios';

export default async function handler(request) {
  const url = new URL(request.url);

  // Use x-vercel-forwarded-url to get the ORIGINAL path
  const forwardedUrl = request.headers.get('x-vercel-forwarded-url');
  let originalPath;
  
  if (forwardedUrl) {
    const fwd = new URL(forwardedUrl, 'https://placeholder.com');
    originalPath = fwd.pathname + fwd.search;
  } else {
    originalPath = url.pathname + url.search;
  }
  
  const target = BACKEND + originalPath;
  
  try {
    const body = request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.text()
      : undefined;

    const headers = {
      'Content-Type': request.headers.get('content-type') || 'application/json',
    };
    if (request.headers.get('authorization')) {
      headers['Authorization'] = request.headers.get('authorization');
    }

    const res = await fetch(target, {
      method: request.method,
      headers,
      body,
    });

    const data = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';

    return new Response(data, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Backend unreachable', detail: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export const config = { runtime: 'edge' };
