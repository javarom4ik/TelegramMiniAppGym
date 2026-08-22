import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

if (!botToken || !webhookSecret || !appUrl) {
  throw new Error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL first");
}
if (!appUrl.startsWith("https://")) {
  throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS");
}

async function callTelegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`${method} failed: ${payload.description ?? response.status}`);
  }
  return payload.result;
}

await callTelegram("setWebhook", {
  url: `${appUrl}/api/telegram/webhook`,
  secret_token: webhookSecret,
  allowed_updates: ["message"],
});

await callTelegram("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Открыть дневник",
    web_app: { url: appUrl },
  },
});

console.log("Telegram webhook and menu button configured");
