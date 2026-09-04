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

async function verifyTurnstile(secret, token, ip, expectedAction, allowedHostnames) {
  if (!secret) return true;
  if (!token || typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return false;
  }
  if (token === "bypass-client-token" && !secret) return true;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.success) return false;
    if (expectedAction && data.action && data.action !== expectedAction) return false;
    if (allowedHostnames && allowedHostnames.length > 0 && data.hostname) {
      if (!allowedHostnames.includes(data.hostname)) return false;
    }
    return true;
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return false;
  }
}

function normalizeKey(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function insertIntoNocoDB(nocoUrl, tableId, token, tableName, data, meta) {
  if (!token) return true;

  // Try fetching table columns if permitted
  let columns = null;
  try {
    const metaRes = await fetch(`${nocoUrl}/api/v2/meta/tables/${tableId}`, {
      headers: { "xc-token": token },
    });
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (Array.isArray(metaData.columns) && metaData.columns.length > 0) {
        columns = metaData.columns;
      }
    }
  } catch {}

  if (columns && columns.length > 0) {
    const allInput = { ...data, ...meta };
    const payload = {};
    const matchedKeys = new Set();

    for (const col of columns) {
      const colTitle = col.title || col.column_name;
      const normCol = normalizeKey(colTitle);
      for (const [inKey, inVal] of Object.entries(allInput)) {
        if (inVal === undefined || inVal === null || inVal === "") continue;
        if (normalizeKey(inKey) === normCol) {
          payload[colTitle] = inVal;
          matchedKeys.add(inKey);
          break;
        }
      }
    }

    const notesExtra = [];
    for (const [inKey, inVal] of Object.entries(data)) {
      if (!matchedKeys.has(inKey) && inVal !== undefined && inVal !== "") {
        notesExtra.push(`${inKey}: ${inVal}`);
      }
    }

    if (notesExtra.length > 0) {
      const noteCol = columns.find(c => ["notes", "note", "message", "details"].includes(normalizeKey(c.title || c.column_name)));
      if (noteCol) {
        const colTitle = noteCol.title || noteCol.column_name;
        payload[colTitle] = (payload[colTitle] ? payload[colTitle] + "\n\n" : "") + `[Additional: ${notesExtra.join(", ")}]`;
      }
    }

    try {
      const res = await fetch(`${nocoUrl}/api/v2/tables/${tableId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xc-token": token },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch (err) {
      console.warn(`[Worker NocoDB] Schema insert error:`, err.message);
    }
  }

  // Attempt 1: Whitelist + standard metadata
  const allowed = FIELDS[tableName] || [];
  const standardRecord = {};
  for (const key of allowed) {
    if (data[key] !== undefined && data[key] !== "") standardRecord[key] = data[key];
  }
  standardRecord.status = "New";
  standardRecord.submitted_at = meta.submitted_at;
  standardRecord.ip = meta.ip;
  standardRecord.user_agent = meta.user_agent;

  try {
    const res = await fetch(`${nocoUrl}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xc-token": token },
      body: JSON.stringify(standardRecord),
    });
    if (res.ok) return true;
  } catch (err) {}

  // Attempt 2: Clean base without metadata
  const cleanBase = {};
  for (const key of allowed) {
    if (data[key] !== undefined && data[key] !== "") cleanBase[key] = data[key];
  }
  try {
    const res = await fetch(`${nocoUrl}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xc-token": token },
      body: JSON.stringify(cleanBase),
    });
    if (res.ok) return true;
  } catch (err) {}

  // Attempt 3: TitleCased fields
  const titleCased = {};
  for (const [k, v] of Object.entries(cleanBase)) {
    const titleKey = k.charAt(0).toUpperCase() + k.slice(1);
    titleCased[titleKey] = v;
  }
  try {
    const res = await fetch(`${nocoUrl}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xc-token": token },
      body: JSON.stringify(titleCased),
    });
    if (res.ok) return true;
  } catch (err) {}

  // Attempt 4: Minimal (Name, Email, Phone, Notes)
  const summaryNotes = Object.entries(cleanBase)
    .filter(([k]) => !["name", "email", "phone", "Name", "Email", "Phone"].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const minimalPayload = {
    Name: data.name,
    Email: data.email,
    Phone: data.phone || "",
    Notes: (data.notes ? data.notes + "\n\n" : "") + summaryNotes,
  };
  try {
    const res = await fetch(`${nocoUrl}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xc-token": token },
      body: JSON.stringify(minimalPayload),
    });
    if (res.ok) return true;
  } catch (err) {}

  return false;
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

    const { table, data = {}, turnstileToken, action } = payload;
    const tableId = TABLE_MAP(env)[table];
    if (!tableId) {
      return new Response(`Unknown table: ${table}`, { status: 400, headers: cors(request, env) });
    }

    if (!data.name || !data.email) {
      return new Response("Missing required fields (name, email)", { status: 400, headers: cors(request, env) });
    }

    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
    const userAgent = request.headers.get("User-Agent") || "";

    if (env.TURNSTILE_SECRET) {
      const allowedHosts = (env.TURNSTILE_HOSTNAMES || "").split(",").map(h => h.trim()).filter(Boolean);
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, ip, action, allowedHosts);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Bot check failed" }), { status: 403, headers: { ...cors(request, env), "Content-Type": "application/json" } });
      }
    }

    const meta = {
      status: "New",
      submitted_at: new Date().toISOString(),
      ip,
      user_agent: userAgent,
    };

    const nocoUrl = (env.NOCODB_URL || "https://nocodb.localsplash.ai").replace(/\/$/, "");
    const token = env.NOCODB_TOKEN || env.NOCODB_API_KEY || "";

    await insertIntoNocoDB(nocoUrl, tableId, token, table, data, meta);

    return new Response(JSON.stringify({ ok: true, table, received: true }), {
      status: 200,
      headers: { ...cors(request, env), "Content-Type": "application/json" },
    });
  },
};
