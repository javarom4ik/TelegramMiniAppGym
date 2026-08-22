import type { AppAction } from "@/lib/app-actions";
import type { StoredAppState } from "@/lib/domain";

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export class AppApiError extends Error {}

export function configureTelegramViewport(webApp: TelegramWebApp): void {
  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor?.("#f4f5f2");
  webApp.setBackgroundColor?.("#f4f5f2");

  try {
    webApp.requestFullscreen?.();
  } catch {
    // Telegram clients older than Bot API 8.0 remain expanded without fullscreen.
  }
}

export function initializeTelegramApp(): string {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData) {
    throw new AppApiError("Откройте дневник через кнопку Telegram-бота.");
  }
  configureTelegramViewport(webApp);
  return webApp.initData;
}

export async function requestAppState(initData: string, action?: AppAction): Promise<StoredAppState> {
  const response = await fetch("/api/app", {
    method: action ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": initData,
    },
    body: action ? JSON.stringify(action) : undefined,
    cache: "no-store",
  });
  const payload = await response.json() as { state?: StoredAppState; error?: string };
  if (!response.ok || !payload.state) {
    throw new AppApiError(payload.error || "Не удалось загрузить данные.");
  }
  return payload.state;
}
