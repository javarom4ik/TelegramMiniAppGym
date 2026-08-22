import { describe, expect, it } from "vitest";
import { isDemoMode } from "./runtime-mode";

describe("runtime mode", () => {
  it("never enables demo data in production", () => {
    expect(isDemoMode("production", "true")).toBe(false);
    expect(isDemoMode("production", "false")).toBe(false);
  });

  it("allows explicit demo mode during local development", () => {
    expect(isDemoMode("development", "true")).toBe(true);
    expect(isDemoMode("development", "false")).toBe(false);
  });
});
