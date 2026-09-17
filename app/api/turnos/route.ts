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
  try {
    const response = await fetch(runtime.GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: runtime.CTRL_TURNOS_API_SECRET }),
      redirect: "follow",
    });
    const text = await response.text();
    if (!text.trim()) {
      return Response.json({ ok: false, error: `Google Apps Script respondió vacío (status ${response.status}). Revisá la implementación activa.` }, { status: 502 });
    }
    try {
      const data = JSON.parse(text) as { ok?: boolean; error?: string };
      return Response.json(data, { status: data.ok ? 200 : 400 });
    } catch {
      return Response.json({ ok: false, error: `Google Apps Script devolvió una respuesta inválida (status ${response.status}). Verificá que la URL termine en /exec y que la implementación permita acceso a cualquier persona.` }, { status: 502 });
    }
  } catch {
    return Response.json({ ok: false, error: "No se pudo conectar con Google Apps Script. Revisá la URL configurada en Cloudflare." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "slots";
  return proxy({ action, from: url.searchParams.get("from"), to: url.searchParams.get("to"), token: url.searchParams.get("token") });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ ok: false, error: "Solicitud inválida" }, { status: 400 }); }
  if (String(payload.action || "").startsWith("admin")) {
    const runtime = env as RuntimeEnv;
    if (!runtime.ADMIN_PASSWORD || payload.adminPassword !== runtime.ADMIN_PASSWORD) {
      return Response.json({ ok: false, error: "Clave incorrecta" }, { status: 401 });
    }
    delete payload.adminPassword;
  }
  return proxy(payload);
}
