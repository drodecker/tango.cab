import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = process.env.SITE_ROOT || (existsSync(join(process.cwd(), "site")) ? resolve(join(process.cwd(), "site")) : "/app/site");
const port = Number(process.env.PORT || 3000);
const tables = {
  investors: process.env.NOCODB_INVESTORS_TABLE || "mqi90dk7p4nlpf0",
  property_partners: process.env.NOCODB_PROPERTY_PARTNERS_TABLE || "m2fsritrqpepcc2",
  careers: process.env.NOCODB_CAREERS_TABLE || "mewoa8u9qvjlsvb",
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

  const record = {};
  for (const key of fields[table]) if (data[key] !== undefined && data[key] !== "") record[key] = data[key];
  record.status = "New";
  record.submitted_at = new Date().toISOString();
  record.ip = ip;
  record.user_agent = userAgent;
  const base = String(process.env.NOCODB_URL || "").replace(/\/$/, "");
  if (!base || !process.env.NOCODB_API_KEY) return send(res, 503, JSON.stringify({ error: "Lead service unavailable" }));
  try {
    const upstream = await fetch(`${base}/api/v2/tables/${tables[table]}/records`, { method: "POST", headers: { "content-type": "application/json", "xc-token": process.env.NOCODB_API_KEY }, body: JSON.stringify(record) });
    if (!upstream.ok) { console.error("NocoDB error", upstream.status, await upstream.text()); return send(res, 502, JSON.stringify({ error: "Unable to save submission" })); }
    return send(res, 200, JSON.stringify({ ok: true }));
  } catch (error) { console.error(error); return send(res, 502, JSON.stringify({ error: "Unable to save submission" })); }
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
