// Sends a short error report to our own database (report_error in
// schema.sql) - what went wrong, on which page, the browser type, never who.
// Used by the browser (app/ErrorReporter.js, app/error.js) and the server
// (instrumentation.js). Never throws: reporting must not cause errors.

// Noise that isn't ours to fix: browser extensions, a harmless resize
// warning, and cross-origin script errors with no detail.
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:|moz-extension:|safari-extension:/i, /Load failed$/i, /NetworkError when attempting to fetch/i, /Failed to fetch$/i];

export function shouldReport(message, stack = "") {
  if (!message || typeof message !== "string") return false;
  return !IGNORE.some((re) => re.test(message) || re.test(stack || ""));
}

export async function reportError({ source = "client", message, stack = "", page = "", userAgent = "", key } = {}) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !apiKey || !shouldReport(message, stack)) return;
    await fetch(`${url}/rest/v1/rpc/report_error`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        p_source: source,
        p_message: String(message).slice(0, 500),
        p_stack: String(stack || "").slice(0, 4000),
        p_page: String(page || "").slice(0, 200),
        p_user_agent: String(userAgent || "").slice(0, 300),
      }),
    });
  } catch {}
}
