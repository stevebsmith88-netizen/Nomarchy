import { reportError } from "./lib/errorReporting";

// Server errors the app doesn't catch itself (a crash in an API route or a
// page render) are reported to Admin > Errors, the same as browser errors.
export async function onRequestError(err, request, context) {
  const message = err instanceof Error ? err.message : String(err);
  await reportError({
    source: "server",
    message: `${message}${context?.routePath ? ` (${context.routePath})` : ""}`,
    stack: err instanceof Error ? err.stack || "" : "",
    page: (request?.path || "").split("?")[0],
    userAgent: "server",
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
