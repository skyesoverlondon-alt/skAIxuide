// kAIxU Gateway — React/Vite integration module
// Reads KAIXU_VIRTUAL_KEY from localStorage; call setKey() from Settings to update it.

const IS_LOCAL =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const GW_BASE = IS_LOCAL ? "/api" : "https://skyesol.netlify.app";
export const GW_URL  = GW_BASE + "/.netlify/functions/gateway-chat";

export function getKey() {
  try { return localStorage.getItem("KAIXU_VIRTUAL_KEY") || ""; } catch { return ""; }
}
export function setKey(k) {
  try {
    if (k) localStorage.setItem("KAIXU_VIRTUAL_KEY", k);
    else    localStorage.removeItem("KAIXU_VIRTUAL_KEY");
  } catch { /* quota / private mode */ }
}

/**
 * Send a chat request through the kAIxU gateway.
 * @param {Array<{role:"user"|"assistant", content:string}>} messages
 * @param {{ provider?:string, model?:string, maxTokens?:number }} opts
 * @returns {Promise<string>} — the model's reply text
 */
export async function gwChat(
  messages,
  { provider = "gemini", model = "gemini-2.0-flash", maxTokens = 2048 } = {}
) {
  const key = getKey();
  if (!key) throw new Error("No KAIXU_VIRTUAL_KEY found. Add your key in Settings → Gateway.");

  const res = await fetch(GW_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({ provider, model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gateway error HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const j = await res.json();
  const reply =
    j.choices?.[0]?.message?.content               // OpenAI shape
    ?? j.candidates?.[0]?.content?.parts?.[0]?.text // Gemini shape
    ?? j.content?.[0]?.text                         // Claude shape
    ?? null;

  if (!reply) throw new Error("Gateway returned an unexpected response shape.");
  return reply;
}

/** Quick gateway health ping — returns ms or null on failure. */
export async function gwPing() {
  try {
    const t0 = performance.now();
    await fetch(GW_URL, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(5000) });
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}
