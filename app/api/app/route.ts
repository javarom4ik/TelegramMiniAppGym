import { parseAppAction } from "@/lib/app-actions";
import { AppServiceError, getAuthenticatedAppState, performAuthenticatedAction } from "@/lib/server/app-service";
import { authenticateTelegramRequest, TelegramAuthError } from "@/lib/telegram/validate-init-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "cache-control": "no-store" };

function errorResponse(error: unknown): Response {
  if (error instanceof TelegramAuthError) {
    const status = error.message === "Access denied" ? 403 : 401;
    return Response.json({ error: error.message }, { status, headers: noStoreHeaders });
  }
  if (error instanceof AppServiceError) {
    return Response.json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
  }
  console.error(error);
  return Response.json({ error: "Не удалось выполнить запрос." }, { status: 500, headers: noStoreHeaders });
}

export async function GET(request: Request) {
  try {
    const { user } = authenticateTelegramRequest(request);
    const state = await getAuthenticatedAppState(user);
    return Response.json({ state }, { headers: noStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = authenticateTelegramRequest(request);
    const action = parseAppAction(await request.json().catch(() => undefined));
    if (!action) throw new AppServiceError("Некорректное действие.");
    const state = await performAuthenticatedAction(user, action);
    return Response.json({ state }, { headers: noStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
