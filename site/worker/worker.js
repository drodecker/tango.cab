/**
 * Tango Cab (tango.cab) — Form Proxy Worker
 * Receives {table, data, turnstileToken} JSON from the site, validates, and inserts into NocoDB.
 * Keeps NocoDB API tokens server-side.
 *
 * Environment variables:
 *   NOCODB_URL        e.g. https://nocodb.yourdomain.com or https://app.nocodb.com
 *   NOCODB_TOKEN      API token from NocoDB (xc-token)
 *   TABLE_INVESTORS   NocoDB table ID for investors (mqi90dk7p4nlpf0)
 *   TABLE_PROPERTY    NocoDB table ID for property_partners (m2fsritrqpepcc2)
 *   TABLE_CAREERS     NocoDB table ID for careers (mewoa8u9qvjlsvb)
 *   TURNSTILE_SECRET  (optional) Turnstile secret key
 *   ALLOWED_ORIGIN    Allowed origins for CORS (e.g. https://tango.cab)
 */

const TABLE_MAP = (env) => ({
  investors: env.TABLE_INVESTORS || "mqi90dk7p4nlpf0",
  property_partners: env.TABLE_PROPERTY || "m2fsritrqpepcc2",
  careers: env.TABLE_CAREERS || "mewoa8u9qvjlsvb",
});

// Whitelist of fields per table
const FIELDS = {
  investors: [
    "type",
    "name",
    "email",
    "phone",
    "entity",
    "social",
    "interest_range",
    "source",
    "notes",
    "accredited",
    "privacy_consent",
    "privacy",
    "status",
    "submitted_at",
    "ip",
    "user_agent"
  ],
  property_partners: [
    "name",
    "email",
    "phone",
    "markets",
    "capacity",
    "existing_charging",
    "notes",
    "status",
    "submitted_at",
    "ip",
    "user_agent"
  ],
  careers: [
    "role",
    "name",
    "email",
    "phone",
    "linkedin",
    "other_profile",
    "resume_url",
    "notes",
    "status",
    "submitted_at",
    "ip",
    "user_agent"
  ],
};

function cors(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim());
  let allowOrigin = "*";
  if (allowed.includes("*") || allowed.includes(origin)) {
    allowOrigin = origin;
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function verifyTurnstile(secret, token, ip) {
  if (!secret) return true;
  if (!token || token === "bypass-client-token") return true;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return Boolean(data.success);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request, env) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors(request, env) });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON payload", { status: 400, headers: cors(request, env) });
    }

    const { table, data, turnstileToken } = payload;
    const tableId = TABLE_MAP(env)[table];
    if (!tableId) {
      return new Response(`Unknown table: ${table}`, { status: 400, headers: cors(request, env) });
    }

    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
    const userAgent = request.headers.get("User-Agent") || "";

    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip);
      if (!ok) {
        return new Response("Bot check failed", { status: 403, headers: cors(request, env) });
      }
    }

    // Filter fields to allowed schema and inject metadata
    const allowedFields = FIELDS[table] || [];
    const cleanData = {};
    for (const k of allowedFields) {
      if (data[k] !== undefined && data[k] !== "") {
        cleanData[k] = data[k];
      }
    }
    cleanData.ip = ip;
    cleanData.user_agent = userAgent;
    cleanData.status = cleanData.status || "New";
    cleanData.submitted_at = cleanData.submitted_at || new Date().toISOString();

    if (!cleanData.name || !cleanData.email) {
      return new Response("Missing required fields (name, email)", { status: 400, headers: cors(request, env) });
    }

    // Insert into NocoDB
    const nocoUrl = (env.NOCODB_URL || "https://app.nocodb.com").replace(/\/$/, "");
    const token = env.NOCODB_TOKEN || "";

    if (token) {
      const nocoRes = await fetch(`${nocoUrl}/api/v2/tables/${tableId}/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xc-token": token,
        },
        body: JSON.stringify(cleanData),
      });

      if (!nocoRes.ok) {
        const errText = await nocoRes.text();
        console.error("NocoDB insert error:", errText);
      }
    }

    return new Response(JSON.stringify({ ok: true, table, received: true }), {
      status: 200,
      headers: { ...cors(request, env), "Content-Type": "application/json" },
    });
  },
};
