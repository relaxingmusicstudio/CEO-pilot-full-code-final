import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mock-auth",
};

const PROVIDERS = ["openai", "gemini"] as const;
type Provider = (typeof PROVIDERS)[number];

type RateEntry = { count: number; windowStart: number };
const rateMap = new Map<string, RateEntry>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const getEncryptionKey = async (): Promise<CryptoKey> => {
  const secret =
    Deno.env.get("INTEGRATIONS_ENCRYPTION_KEY") ||
    Deno.env.get("VAULT_ENCRYPTION_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Missing encryption secret");
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

const decrypt = async (ciphertext: string): Promise<string> => {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
};

const fetchWithAbort = async (input: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

const checkRateLimit = (userId: string) => {
  const now = Date.now();
  const current = rateMap.get(userId);
  if (!current || now - current.windowStart > RATE_WINDOW_MS) {
    rateMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (current.count >= RATE_LIMIT) return true;
  current.count += 1;
  rateMap.set(userId, current);
  return false;
};

const getDemoKey = (provider: Provider) => {
  if (provider === "openai") return Deno.env.get("OPENAI_API_KEY");
  if (provider === "gemini") return Deno.env.get("GEMINI_API_KEY");
  return undefined;
};

const resolveKey = async (provider: Provider, ciphertext?: string | null) => {
  if (ciphertext) {
    return { key: await decrypt(ciphertext), usedDemoKey: false, demoAvailable: !!getDemoKey(provider) };
  }
  const allowDemo = Deno.env.get("LLM_ALLOW_DEMO_KEYS") === "true";
  const demoKey = getDemoKey(provider);
  if (allowDemo && demoKey) {
    return { key: demoKey, usedDemoKey: true, demoAvailable: true };
  }
  throw new Error("No key configured. Add one in Integrations.");
};

const promptTooLong = (prompt: string) => prompt.length > 1500;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const start = Date.now();

  const safeLog = (payload: Record<string, unknown>) => {
    const copy = { ...payload };
    delete (copy as unknown).apiKey;
    console.log("[llm-gateway]", copy);
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ ok: false, error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { provider, task, input, meta } = body ?? {};

    if (!PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ ok: false, provider, code: "bad_provider", message: "Unsupported provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mockMode = req.headers.get("x-mock-auth") === "true" || Deno.env.get("VITE_MOCK_AUTH") === "true";
    if (mockMode) {
      safeLog({ provider, task, mock: true });
      return new Response(
        JSON.stringify({
          ok: true,
          provider,
          usedDemoKey: false,
          demoAvailable: true,
          latencyMs: 15,
          text: "OK",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, provider, code: "unauthorized", message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ ok: false, provider, code: "rate_limited", message: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row } = await supabase
      .from("user_integrations")
      .select("api_key_ciphertext")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();

    let resolved;
    try {
      resolved = await resolveKey(provider, row?.api_key_ciphertext);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No key configured. Add one in Integrations.";
      return new Response(
        JSON.stringify({ ok: false, provider, code: "no_key", message, demoAvailable: !!getDemoKey(provider) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowLive = meta?.allowLive === true || Deno.env.get("LLM_LIVE_CALLS_DEFAULT") === "true";
    if (!allowLive) {
      return new Response(
        JSON.stringify({ ok: false, provider, code: "live_disabled", message: "Live calls are disabled", demoAvailable: resolved.demoAvailable }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = typeof input === "string" && input.trim().length > 0 ? input : "Return only the word OK.";
    if (promptTooLong(prompt)) {
      return new Response(
        JSON.stringify({ ok: false, provider, code: "prompt_too_long", message: "Prompt too long", demoAvailable: resolved.demoAvailable }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maxTokens = Math.max(1, Math.min(256, meta?.maxTokens ?? 64));

    try {
      if (provider === "openai") {
        const resp = await fetchWithAbort(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resolved.key}`,
            },
            body: JSON.stringify({
              model: "gpt-3.5-turbo",
              messages: [{ role: "user", content: prompt }],
              max_tokens: maxTokens,
            }),
          },
          8000
        );
        const latencyMs = Date.now() - start;
        if (!resp.ok) {
          const errText = await resp.text();
          safeLog({ provider, task, status: resp.status, usedDemoKey: resolved.usedDemoKey, error: "openai_error" });
          return new Response(
            JSON.stringify({ ok: false, provider, code: "openai_error", message: errText.slice(0, 300) || resp.statusText }),
            { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content?.toString()?.trim() ?? "";
        safeLog({ provider, task, latencyMs, usedDemoKey: resolved.usedDemoKey });
        return new Response(
          JSON.stringify({ ok: true, provider, usedDemoKey: resolved.usedDemoKey, demoAvailable: resolved.demoAvailable, latencyMs, text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (provider === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${encodeURIComponent(
          resolved.key
        )}`;
        const resp = await fetchWithAbort(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              generationConfig: { maxOutputTokens: maxTokens },
              contents: [{ parts: [{ text: prompt }] }],
            }),
          },
          8000
        );
        const latencyMs = Date.now() - start;
        if (!resp.ok) {
          const errText = await resp.text();
          safeLog({ provider, task, status: resp.status, usedDemoKey: resolved.usedDemoKey, error: "gemini_error" });
          return new Response(
            JSON.stringify({ ok: false, provider, code: "gemini_error", message: errText.slice(0, 300) || resp.statusText }),
            { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.toString()?.trim() ?? "";
        safeLog({ provider, task, latencyMs, usedDemoKey: resolved.usedDemoKey });
        return new Response(
          JSON.stringify({ ok: true, provider, usedDemoKey: resolved.usedDemoKey, demoAvailable: resolved.demoAvailable, latencyMs, text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (err) {
      safeLog({ provider, task, error: "invoke_error", message: err instanceof Error ? err.message : String(err) });
      return new Response(
        JSON.stringify({ ok: false, provider, code: "invoke_error", message: "Provider request failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, provider, code: "unknown_error", message: "Unhandled provider" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    safeLog({ error: "unhandled", message });
    return new Response(JSON.stringify({ ok: false, code: "unhandled", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
