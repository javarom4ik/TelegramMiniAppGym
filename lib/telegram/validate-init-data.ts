import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type ValidatedInitData = {
  authDate: number;
  queryId?: string;
  user: TelegramUser;
};

export class TelegramAuthError extends Error {}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
  nowSeconds = Math.floor(Date.now() / 1000),
): ValidatedInitData {
  if (!initData || !botToken) throw new TelegramAuthError("Missing Telegram credentials");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new TelegramAuthError("Missing Telegram hash");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();

  let received: Buffer;
  try {
    received = Buffer.from(receivedHash, "hex");
  } catch {
    throw new TelegramAuthError("Invalid Telegram hash");
  }

  if (received.length !== calculatedHash.length || !timingSafeEqual(received, calculatedHash)) {
    throw new TelegramAuthError("Telegram signature mismatch");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) throw new TelegramAuthError("Invalid auth date");
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > maxAgeSeconds) {
    throw new TelegramAuthError("Telegram authorization expired");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new TelegramAuthError("Missing Telegram user");

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new TelegramAuthError("Invalid Telegram user");
  }
  if (!Number.isSafeInteger(user.id) || !user.first_name) {
    throw new TelegramAuthError("Invalid Telegram user");
  }

  return { authDate, queryId: params.get("query_id") ?? undefined, user };
}

export function parseAllowedTelegramIds(value = process.env.ALLOWED_TELEGRAM_IDS ?? ""): Set<number> {
  return new Set(
    value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter(Number.isSafeInteger),
  );
}

export function authenticateTelegramRequest(request: Request): ValidatedInitData {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new TelegramAuthError("Bot token is not configured");
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const validated = validateTelegramInitData(initData, botToken);
  const allowed = parseAllowedTelegramIds();
  if (!allowed.has(validated.user.id)) throw new TelegramAuthError("Access denied");
  return validated;
}
