import { timingSafeEqual } from "node:crypto";
import { parseAllowedTelegramIds } from "@/lib/telegram/validate-init-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { id: number; first_name?: string };
  };
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendMessage(chatId: number, text: string, allowed: boolean) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const replyMarkup = allowed && process.env.NEXT_PUBLIC_APP_URL
    ? {
        inline_keyboard: [[{
          text: "Открыть дневник",
          web_app: { url: process.env.NEXT_PUBLIC_APP_URL },
        }]],
      }
    : undefined;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}

export async function POST(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!configuredSecret || !safeEqual(receivedSecret, configuredSecret)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.from || !message.text?.startsWith("/start")) {
    return Response.json({ ok: true });
  }

  const allowed = parseAllowedTelegramIds().has(message.from.id);
  await sendMessage(
    message.chat.id,
    allowed
      ? `Привет, ${message.from.first_name ?? "спортсмен"}. Здесь хранится твой тренировочный прогресс.`
      : "У этого дневника закрытый доступ.",
    allowed,
  );
  return Response.json({ ok: true });
}
