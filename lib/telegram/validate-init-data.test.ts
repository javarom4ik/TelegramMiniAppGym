import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TelegramAuthError, validateTelegramInitData } from "./validate-init-data";

function signedInitData(botToken: string, authDate: number) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "query-1",
    user: JSON.stringify({ id: 123456789, first_name: "Роман" }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

describe("Telegram Mini App authentication", () => {
  it("validates signed and fresh initData", () => {
    const now = 1_787_400_000;
    const result = validateTelegramInitData(signedInitData("token", now - 5), "token", 60, now);
    expect(result.user).toMatchObject({ id: 123456789, first_name: "Роман" });
  });

  it("rejects tampering", () => {
    const now = 1_787_400_000;
    const tampered = signedInitData("token", now).replace("123456789", "123456780");
    expect(() => validateTelegramInitData(tampered, "token", 60, now)).toThrow(TelegramAuthError);
  });

  it("rejects stale authorization", () => {
    const now = 1_787_400_000;
    expect(() => validateTelegramInitData(signedInitData("token", now - 61), "token", 60, now)).toThrow("expired");
  });
});
