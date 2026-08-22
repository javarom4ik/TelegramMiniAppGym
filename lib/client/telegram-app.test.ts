import { describe, expect, it, vi } from "vitest";
import { configureTelegramViewport } from "./telegram-app";

function telegramWebApp(overrides: Record<string, unknown> = {}) {
  return {
    initData: "signed-data",
    ready: vi.fn(),
    expand: vi.fn(),
    ...overrides,
  };
}

describe("Telegram viewport setup", () => {
  it("requests fullscreen when the Telegram client supports it", () => {
    const requestFullscreen = vi.fn();
    const setHeaderColor = vi.fn();
    const setBackgroundColor = vi.fn();
    const webApp = telegramWebApp({ requestFullscreen, setHeaderColor, setBackgroundColor });

    configureTelegramViewport(webApp);

    expect(webApp.ready).toHaveBeenCalledOnce();
    expect(webApp.expand).toHaveBeenCalledOnce();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(setHeaderColor).toHaveBeenCalledWith("#f4f5f2");
    expect(setBackgroundColor).toHaveBeenCalledWith("#f4f5f2");
  });

  it("keeps the expanded fallback on older clients", () => {
    const webApp = telegramWebApp();

    expect(() => configureTelegramViewport(webApp)).not.toThrow();
    expect(webApp.expand).toHaveBeenCalledOnce();
  });
});
