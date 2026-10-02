// The daily error email (run by the daily job in app/api/refresh-coords).
// If anything went wrong in the last 24 hours, emails a short summary to
// ALERT_EMAIL (or, if that isn't set, the owner's account email). Quiet
// days send nothing. Also clears out reports older than 90 days.

const SITE_URL = "https://nomarchy.ca";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function buildDigestEmail(errors) {
  const total = errors.reduce((n, e) => n + (e.occurrences || 1), 0);
  const rows = errors
    .slice(0, 10)
    .map((e) => `<li style="margin-bottom:8px;"><strong>${escapeHtml(e.message)}</strong><br/><span style="color:#666;">${escapeHtml(e.source)} · ${escapeHtml(e.page || "unknown page")} · ${e.occurrences || 1}×</span></li>`)
    .join("");
  const more = errors.length > 10 ? `<p style="color:#666;">…and ${errors.length - 10} more.</p>` : "";
  return {
    subject: `Nomarchy: ${errors.length} error${errors.length === 1 ? "" : "s"} in the last day`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;">
      <p style="font-size:16px;"><strong>${total} error report${total === 1 ? "" : "s"}</strong> across ${errors.length} different problem${errors.length === 1 ? "" : "s"} in the last 24 hours.</p>
      <ul style="padding-left:18px;font-size:13px;">${rows}</ul>${more}
      <p style="font-size:13px;">Full details in <a href="${SITE_URL}">Nomarchy</a> under Admin &gt; Errors.</p>
    </div>`,
  };
}

async function ownerEmail(admin) {
  if (process.env.ALERT_EMAIL) return process.env.ALERT_EMAIL;
  const { data } = await admin.from("profiles").select("id").eq("is_owner", true).limit(1);
  if (!data?.[0]) return null;
  const { data: u } = await admin.auth.admin.getUserById(data[0].id);
  return u?.user?.email || null;
}

export async function runErrorDigest(admin, { now = () => Date.now(), sendEmail } = {}) {
  const dayAgo = new Date(now() - 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  await admin.from("app_errors").delete().lt("last_seen", ninetyDaysAgo);

  const { data: errors, error } = await admin
    .from("app_errors")
    .select("message, source, page, occurrences, last_seen")
    .gt("last_seen", dayAgo)
    .order("occurrences", { ascending: false });
  if (error) return { sent: false, reason: "app_errors not available" };
  if (!errors.length) return { sent: false, reason: "no errors" };

  const to = await ownerEmail(admin);
  if (!to) return { sent: false, reason: "no address to send to" };
  const { subject, html } = buildDigestEmail(errors);
  await sendEmail(to, subject, html);
  return { sent: true, errors: errors.length };
}

export async function sendWithSendGrid(to, subject, html) {
  if (!process.env.SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY not configured");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.DIGEST_FROM_EMAIL || "hello@nomarchy.ca", name: "Nomarchy" },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}`);
}
