import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the app's logic (no browser, no real database or Google).
// Run with `npm test`. GitHub runs them on every push (.github/workflows).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key" },
  },
});
