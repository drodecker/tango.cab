import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = "/app/site";
const port = Number(process.env.PORT || 3000);
const tables = {
  investors: process.env.NOCODB_INVESTORS_TABLE || "mqi90dk7p4nlpf0",
  property_partners: process.env.NOCODB_PROPERTY_PARTNERS_TABLE || "m2fsritrqpepcc2",
  careers: process.env.NOCODB_CAREERS_TABLE || "mewoa8u9qvjlsvb",
};
const fields = {
  investors: ["type", "name", "email", "phone", "entity", "social", "interest_range", "source", "notes", "accredited"],
  property_partners: ["name", "email", "phone", "markets", "capacity", "existing_charging", "notes"],
  careers: ["role", "name", "email", "phone", "linkedin", "other_profile", "resume_url", "notes"],
};
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
  res.end(body);
}

async function submit(req, res) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return send(res, 413, JSON.stringify({ error: "Payload too large" })); }
  let payload;
  try { payload = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: "Invalid submission" })); }
  const { table, data = {} } = payload;
  if (!tables[table] || !data.name || !data.email) return send(res, 400, JSON.stringify({ error: "Missing required fields" }));
  const record = {};
  for (const key of fields[table]) if (data[key] !== undefined && data[key] !== "") record[key] = data[key];
  record.status = "New";
  record.submitted_at = new Date().toISOString();
  record.ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  record.user_agent = String(req.headers["user-agent"] || "");
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
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
  const path = join(root, safe);
  if (!path.startsWith(root)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not file");
    const body = await readFile(path);
    res.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": extname(path) === ".html" ? "no-cache" : "public, max-age=604800", "x-content-type-options": "nosniff" });
    if (req.method === "HEAD") return res.end();
    res.end(body);
  } catch { send(res, 404, "Not found", "text/plain; charset=utf-8"); }
}).listen(port, "0.0.0.0", () => console.log(`Tango listening on ${port}`));
