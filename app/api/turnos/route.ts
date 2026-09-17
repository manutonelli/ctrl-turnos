import { env } from "cloudflare:workers";

type RuntimeEnv = Cloudflare.Env & {
  GOOGLE_APPS_SCRIPT_URL?: string;
  CTRL_TURNOS_API_SECRET?: string;
  ADMIN_PASSWORD?: string;
};

async function proxy(payload: Record<string, unknown>) {
  const runtime = env as RuntimeEnv;
  if (!runtime.GOOGLE_APPS_SCRIPT_URL || !runtime.CTRL_TURNOS_API_SECRET) {
    return Response.json({ ok: false, error: "La agenda todavía no está conectada" }, { status: 503 });
  }
  const response = await fetch(runtime.GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: runtime.CTRL_TURNOS_API_SECRET }),
    redirect: "follow",
  });
  const data = await response.json() as { ok?: boolean; error?: string };
  return Response.json(data, { status: data.ok ? 200 : 400 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "slots";
  return proxy({ action, from: url.searchParams.get("from"), to: url.searchParams.get("to"), token: url.searchParams.get("token") });
}

export async function POST(request: Request) {
  const payload = await request.json() as Record<string, unknown>;
  if (String(payload.action || "").startsWith("admin")) {
    const runtime = env as RuntimeEnv;
    if (!runtime.ADMIN_PASSWORD || payload.adminPassword !== runtime.ADMIN_PASSWORD) {
      return Response.json({ ok: false, error: "Clave incorrecta" }, { status: 401 });
    }
    delete payload.adminPassword;
  }
  return proxy(payload);
}
