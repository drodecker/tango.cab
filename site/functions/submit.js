/**
 * Cloudflare Pages Function: /submit
 * Proxies form submissions to the Cloudflare Worker form relay.
 */
const FORM_WORKER_URL = "https://occab-forms.dave-73f.workers.dev/submit";

export async function onRequestPost({ request }) {
  const payload = await request.text();
  const response = await fetch(FORM_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      Origin: "https://tango.cab",
    },
    body: payload,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
