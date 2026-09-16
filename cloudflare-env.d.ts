declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_APPS_SCRIPT_URL?: string;
    CTRL_TURNOS_API_SECRET?: string;
  }
}
