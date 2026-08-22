import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN
      && process.env.TELEGRAM_WEBHOOK_SECRET
      && process.env.ALLOWED_TELEGRAM_IDS,
  );
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  let databaseReachable = false;

  if (databaseConfigured) {
    try {
      await getDb().execute(sql`select 1`);
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }

  const ok = databaseReachable && telegramConfigured && appUrlConfigured;
  return Response.json(
    { ok, databaseConfigured, databaseReachable, telegramConfigured, appUrlConfigured },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
