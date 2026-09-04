import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = process.env.SITE_ROOT || (existsSync(join(process.cwd(), "site")) ? resolve(join(process.cwd(), "site")) : "/app/site");
const port = Number(process.env.PORT || 3000);
const tables = {
  investors: process.env.NOCODB_INVESTORS_TABLE || process.env.TABLE_INVESTORS || "mqi90dk7p4nlpf0",
  property_partners: process.env.NOCODB_PROPERTY_PARTNERS_TABLE || process.env.TABLE_PROPERTY || process.env.TABLE_PROPERTY_PARTNERS || process.env.NOCODB_PROPERTY_TABLE || "m2fsritrqpepcc2",
  careers: process.env.NOCODB_CAREERS_TABLE || process.env.TABLE_CAREERS || "mewoa8u9qvjlsvb",
};
const fields = {
  investors: ["type", "name", "email", "phone", "entity", "social", "interest_range", "source", "notes", "accredited", "privacy_consent", "privacy"],
  property_partners: ["name", "email", "phone", "markets", "capacity", "existing_charging", "notes"],
  careers: ["role", "name", "email", "phone", "linkedin", "other_profile", "resume_url", "notes"],
};
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
  res.end(body);
}

async function verifyTurnstile(secret, token, ip, expectedAction, allowedHostnames) {
  if (!secret) return true;
  if (!token || typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  if (token === "bypass-client-token" && !secret) return true;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.success) return false;
    if (expectedAction && data.action && data.action !== expectedAction) return false;
    if (allowedHostnames && allowedHostnames.length > 0 && data.hostname && !allowedHostnames.includes(data.hostname)) return false;
    return true;
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return false;
  }
}

const tableColumnsCache = new Map();

function normalizeKey(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getSelectOptions(col) {
  const options = col?.colOptions?.options;
  if (!Array.isArray(options)) return null;
  return options.map(option => option?.title ?? option?.value ?? option?.label ?? option).filter(Boolean).map(String);
}

function isAllowedColumnValue(col, value) {
  const type = col?.uidt || "";
  if (!["SingleSelect", "MultiSelect"].includes(type)) return true;
  const options = getSelectOptions(col);
  if (!options || options.length === 0) return false;
  const values = Array.isArray(value) ? value : String(value).split(",").map(v => v.trim()).filter(Boolean);
  return values.every(v => options.includes(v));
}

async function getTableColumns(base, tableId, apiKey) {
  const cached = tableColumnsCache.get(tableId);
  if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
    return cached.columns;
  }
  try {
    const res = await fetch(`${base}/api/v2/meta/tables/${tableId}`, {
      headers: { "xc-token": apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const cols = data.columns || [];
      if (Array.isArray(cols) && cols.length > 0) {
        tableColumnsCache.set(tableId, { columns: cols, timestamp: Date.now() });
        return cols;
      }
    }
  } catch {
    // meta endpoint might be restricted; fallback handlers will be used
  }
  return null;
}

async function insertIntoNocoDB(base, tableId, apiKey, tableName, data, meta) {
  const columns = await getTableColumns(base, tableId, apiKey);

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
          if (!isAllowedColumnValue(col, inVal)) continue;
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
      const res = await fetch(`${base}/api/v2/tables/${tableId}/records`, {
        method: "POST",
        headers: { "content-type": "application/json", "xc-token": apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return true;
      console.warn(`[NocoDB] Schema mapped insert failed for ${tableName} (${tableId}) [${res.status}]:`, await res.text());
    } catch (err) {
      console.warn(`[NocoDB] Schema mapped request error for ${tableName}:`, err.message);
    }
  }

  // Attempt 1: Whitelist + standard metadata
  const allowed = fields[tableName] || [];
  const standardRecord = {};
  for (const key of allowed) {
    if (data[key] !== undefined && data[key] !== "") standardRecord[key] = data[key];
  }
  standardRecord.status = "New";
  standardRecord.submitted_at = meta.submitted_at;
  standardRecord.ip = meta.ip;
  standardRecord.user_agent = meta.user_agent;

  try {
    const res = await fetch(`${base}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "content-type": "application/json", "xc-token": apiKey },
      body: JSON.stringify(standardRecord),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return true;
    console.warn(`[NocoDB] Standard insert failed for ${tableName} [${res.status}]:`, await res.text());
  } catch (err) {
    console.warn(`[NocoDB] Standard request error for ${tableName}:`, err.message);
  }

  // Attempt 2: Clean base without metadata columns
  const cleanBase = {};
  for (const key of allowed) {
    if (data[key] !== undefined && data[key] !== "") cleanBase[key] = data[key];
  }
  try {
    const res = await fetch(`${base}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "content-type": "application/json", "xc-token": apiKey },
      body: JSON.stringify(cleanBase),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return true;
    console.warn(`[NocoDB] Clean base insert failed for ${tableName} [${res.status}]:`, await res.text());
  } catch (err) {
    console.warn(`[NocoDB] Clean base request error for ${tableName}:`, err.message);
  }

  // Attempt 3: TitleCased fields
  const titleCased = {};
  for (const [k, v] of Object.entries(cleanBase)) {
    const titleKey = k.charAt(0).toUpperCase() + k.slice(1);
    titleCased[titleKey] = v;
  }
  try {
    const res = await fetch(`${base}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "content-type": "application/json", "xc-token": apiKey },
      body: JSON.stringify(titleCased),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return true;
    console.warn(`[NocoDB] TitleCased insert failed for ${tableName} [${res.status}]:`, await res.text());
  } catch (err) {
    console.warn(`[NocoDB] TitleCased request error for ${tableName}:`, err.message);
  }

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
    const res = await fetch(`${base}/api/v2/tables/${tableId}/records`, {
      method: "POST",
      headers: { "content-type": "application/json", "xc-token": apiKey },
      body: JSON.stringify(minimalPayload),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return true;
    console.error(`[NocoDB] Minimal TitleCased insert failed for ${tableName} [${res.status}]:`, await res.text());
  } catch (err) {
    console.error(`[NocoDB] Minimal request error for ${tableName}:`, err.message);
  }

  return false;
}

function mapToInvestorsFallback(tableName, data) {
  if (tableName === "property_partners") {
    const propertyNotes = [
      `[PROPERTY PARTNER / DEPOT INQUIRY]`,
      data.capacity ? `Capacity / Type: ${data.capacity}` : "",
      data.existing_charging ? `Existing Infrastructure: ${data.existing_charging}` : "",
      data.markets ? `Markets / Location: ${data.markets}` : "",
      data.notes ? `Operational Notes: ${data.notes}` : "",
    ].filter(Boolean).join("\n");

    return {
      type: "Property Partner",
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      entity: data.capacity || "",
      source: data.markets || "tango.cab",
      notes: propertyNotes,
    };
  }

  if (tableName === "careers") {
    const careerNotes = [
      `[CAREERS / LEADERSHIP INQUIRY]`,
      `Target Role: ${data.role || "Other"}`,
      data.linkedin ? `LinkedIn Profile: ${data.linkedin}` : "",
      data.other_profile ? `Other Profile: ${data.other_profile}` : "",
      data.resume_url ? `Resume URL: ${data.resume_url}` : "",
      data.notes ? `Background / Track Record: ${data.notes}` : "",
    ].filter(Boolean).join("\n");

    return {
      type: `Careers (${data.role || "Other"})`,
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      entity: data.role || "Careers",
      social: data.linkedin || data.other_profile || "",
      source: "tango.cab/about",
      notes: careerNotes,
    };
  }

  return data;
}

async function submit(req, res) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return send(res, 413, JSON.stringify({ error: "Payload too large" })); }
  let payload;
  try { payload = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: "Invalid submission" })); }
  const { table, data = {}, turnstileToken, action } = payload;
  if (!tables[table] || !data.name || !data.email) return send(res, 400, JSON.stringify({ error: "Missing required fields" }));

  const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const userAgent = String(req.headers["user-agent"] || "");

  if (process.env.TURNSTILE_SECRET) {
    const allowedHosts = (process.env.TURNSTILE_HOSTNAMES || "").split(",").map(h => h.trim()).filter(Boolean);
    const ok = await verifyTurnstile(process.env.TURNSTILE_SECRET, turnstileToken, ip, action, allowedHosts);
    if (!ok) return send(res, 403, JSON.stringify({ error: "Bot check failed" }));
  }

  const base = String(process.env.NOCODB_URL || "https://nocodb.localsplash.ai").replace(/\/$/, "");
  const apiKey = process.env.NOCODB_API_KEY || process.env.NOCODB_TOKEN || process.env.XC_TOKEN || "";
  if (!base || !apiKey) {
    console.error("Lead service unavailable: missing NOCODB_API_KEY or NOCODB_URL");
    return send(res, 503, JSON.stringify({ error: "Lead service unavailable" }));
  }

  const meta = {
    status: "New",
    submitted_at: new Date().toISOString(),
    ip: ip,
    user_agent: userAgent
  };

  try {
    let ok = await insertIntoNocoDB(base, tables[table], apiKey, table, data, meta);

    // If dedicated table insertion failed and not already on investors table, fallback to primary working table
    if (!ok && table !== "investors") {
      console.warn(`[NocoDB] Retrying ${table} submission via primary working table (${tables.investors})...`);
      const fallbackData = mapToInvestorsFallback(table, data);
      ok = await insertIntoNocoDB(base, tables.investors, apiKey, "investors", fallbackData, meta);
      if (ok) {
        console.log(`[NocoDB] Successfully recorded ${table} lead into primary table (${tables.investors})!`);
      }
    }

    if (!ok) {
      return send(res, 502, JSON.stringify({ error: "Unable to save submission" }));
    }
    return send(res, 200, JSON.stringify({ ok: true }));
  } catch (error) {
    console.error("Submission processing error:", error);
    return send(res, 502, JSON.stringify({ error: "Unable to save submission" }));
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/submit") return submit(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
  const pathname = url.pathname;
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(root, safe);
  if (!filePath.startsWith(root)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    let info;
    try {
      info = await stat(filePath);
    } catch {
      if (!extname(filePath)) {
        filePath = filePath + ".html";
        info = await stat(filePath);
      }
    }
    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
      info = await stat(filePath);
    }
    if (!info.isFile()) throw new Error("not file");
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream", "cache-control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=604800", "x-content-type-options": "nosniff" });
    if (req.method === "HEAD") return res.end();
    res.end(body);
  } catch { send(res, 404, "Not found", "text/plain; charset=utf-8"); }
}).listen(port, "0.0.0.0", () => console.log(`Tango listening on ${port}`));
