import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/csp";

describe("content security policy", () => {
  it("uses a nonce with strict-dynamic and no unsafe-inline scripts in production", () => {
    const csp = buildCsp("abc123", "https://proj.supabase.co", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp).toContain("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://proj.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows eval and plain websockets only for local development", () => {
    const csp = buildCsp("n", "http://127.0.0.1:54321", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws://127.0.0.1:54321");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("generates unpredictable nonces", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});
