export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function cors(r: Response): Response {
  const h = new Headers(r.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => h.set(k, v));
  return new Response(r.body, { status: r.status, headers: h });
}
