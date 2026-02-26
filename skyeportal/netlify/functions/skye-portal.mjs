// ── kAIxuGateway13 Proxy ──────────────────────────────────────────────────────
// All AI calls route through https://skyesol.netlify.app/.netlify/functions/gateway-chat
// This function acts as a local adapter: converts legacy 'input' format to the
// standard kAIxu gateway payload, forwards with the client's KAIXU_VIRTUAL_KEY.
// ─────────────────────────────────────────────────────────────────────────────

const KAIXU_GATEWAY_URL = "https://skyesol.netlify.app/.netlify/functions/gateway-chat";
const DEFAULT_PROVIDER   = "gemini";
const DEFAULT_MODEL      = "gemini-2.0-flash";
const MAX_TOKENS         = 8192;

export const handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  // GET health / meta
  if (event.httpMethod === "GET") {
    return json(200, corsHeaders, { ok: true, gateway: KAIXU_GATEWAY_URL, provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL });
  }

  if (event.httpMethod !== "POST") {
    return json(405, corsHeaders, { error: { message: "Use POST." } });
  }

  // Extract KAIXU_VIRTUAL_KEY from Authorization header
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const kaixuKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!kaixuKey) {
    return json(401, corsHeaders, { error: { message: "Authorization: Bearer <KAIXU_VIRTUAL_KEY> required." } });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, corsHeaders, { error: { message: "Invalid JSON body." } });
  }

  // Accept both legacy 'input' (string) and standard 'messages' array formats
  let messages;
  if (Array.isArray(body.messages) && body.messages.length) {
    messages = body.messages;
  } else {
    const input = (body.input || "").toString().trim();
    if (!input) return json(400, corsHeaders, { error: { message: "Missing 'input' or 'messages'." } });
    const maxChars = Number(process.env.MAX_INPUT_CHARS || 8000);
    if (input.length > maxChars) return json(413, corsHeaders, { error: { message: `Input too large. Max ${maxChars} chars.` } });
    messages = [{ role: "user", content: input }];
  }

  const provider = (body.provider || DEFAULT_PROVIDER).toString().trim();
  const model    = (body.model    || DEFAULT_MODEL   ).toString().trim();

  const gatewayPayload = {
    provider,
    model,
    messages,
    max_tokens:  body.max_tokens  || MAX_TOKENS,
    temperature: body.temperature ?? 0.7
  };

  const upstreamRes = await fetch(KAIXU_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${kaixuKey}`
    },
    body: JSON.stringify(gatewayPayload)
  });

  const upstreamJson = await upstreamRes.json().catch(() => ({}));

  if (!upstreamRes.ok) {
    const msg = upstreamJson?.error?.message || `Gateway error (${upstreamRes.status}).`;
    return json(upstreamRes.status, corsHeaders, { error: { message: msg } });
  }

  // Return gateway response; also expose 'text' for legacy clients
  return json(200, corsHeaders, {
    ...upstreamJson,
    text: upstreamJson.output_text || ""
  });
};

function json(statusCode, corsHeaders, obj) {
  return {
    statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  };
}
