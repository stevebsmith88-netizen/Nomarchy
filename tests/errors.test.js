import { describe, it, expect, vi } from "vitest";
import { shouldReport } from "@/lib/errorReporting";
import { buildDigestEmail, runErrorDigest } from "@/lib/errorDigest";
import { fakeDb } from "./fakeDb";

describe("error reporting", () => {
  it("ignores browser-extension and network noise", () => {
    expect(shouldReport("Cannot read properties of undefined (reading 'name')")).toBe(true);
    expect(shouldReport("ResizeObserver loop completed with undelivered notifications.")).toBe(false);
    expect(shouldReport("Script error.")).toBe(false);
    expect(shouldReport("boom", "at chrome-extension://abc/x.js")).toBe(false);
    expect(shouldReport("")).toBe(false);
  });
});

describe("daily error email", () => {
  const NOW = Date.parse("2026-11-02T13:00:00Z");
  const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();

  it("escapes what was reported, so an error message can't inject HTML", () => {
    const { html, subject } = buildDigestEmail([{ message: "<img src=x onerror=alert(1)>", source: "client", page: "/", occurrences: 3 }]);
    expect(html).not.toContain("<img");
    expect(subject).toBe("Nomarchy: 1 error in the last day");
  });

  it("sends only when something went wrong, and clears out old reports", async () => {
    const db = fakeDb({ app_errors: [
      { message: "recent", source: "client", page: "/", occurrences: 2, last_seen: hoursAgo(3) },
      { message: "old", source: "server", page: "/api/x", occurrences: 1, last_seen: hoursAgo(24 * 100) },
    ] });
    process.env.ALERT_EMAIL = "alerts@example.com";
    const sendEmail = vi.fn(async () => {});
    const result = await runErrorDigest(db, { now: () => NOW, sendEmail });
    expect(result).toEqual({ sent: true, errors: 1 });
    expect(sendEmail).toHaveBeenCalledWith("alerts@example.com", expect.stringContaining("1 error"), expect.stringContaining("recent"));
    expect(db.tables.app_errors.map((e) => e.message)).toEqual(["recent"]);

    db.tables.app_errors = [];
    sendEmail.mockClear();
    expect((await runErrorDigest(db, { now: () => NOW, sendEmail })).sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    delete process.env.ALERT_EMAIL;
  });
});
