/**
 * Content-Security-Policy with a per-request nonce. Next.js reads the nonce
 * from the request's CSP header and applies it to its own inline scripts;
 * next-themes receives it explicitly. 'strict-dynamic' lets those trusted
 * scripts load the app's chunks without allow-listing hosts.
 */
export function buildCsp(nonce: string, supabaseUrl: string | undefined, isDev = process.env.NODE_ENV !== "production"): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl) : null;
  const supabaseHttp = supabase ? supabase.origin : "";
  const supabaseWs = supabase ? `${supabase.protocol === "http:" ? "ws" : "wss"}://${supabase.host}` : "";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are used by Radix, sonner and next/image.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabaseHttp].filter(Boolean),
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabaseHttp, supabaseWs].filter(Boolean),
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
