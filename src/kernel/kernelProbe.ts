const DEFAULT_HEALTH_PATH = "/api/health";

const normalizeBaseUrl = (value) => (value || "").trim().replace(/\/+$/, "");

const normalizePath = (value) => {
  const raw = (value || DEFAULT_HEALTH_PATH).trim() || DEFAULT_HEALTH_PATH;
  return raw.startsWith("/") ? raw : `/${raw}`;
};

export const probeKernelStatus = async ({
  baseUrl,
  healthPath,
  authHeader,
  authValue,
  timeoutMs = 3000,
}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = normalizePath(healthPath);

  if (!normalizedBaseUrl) {
    return {
      ok: false,
      status: "degraded",
      reason: "KERNEL_BASE_URL not set",
      hint: "Set KERNEL_BASE_URL and KERNEL_HEALTH_PATH to reach the kernel.",
      kernelBaseUrl: null,
      kernelHealthPath: normalizedPath,
      latencyMs: null,
      upstreamStatus: null,
    };
  }

  const headers = {};
  if (authHeader && authValue) {
    headers[authHeader] = authValue;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${normalizedBaseUrl}${normalizedPath}`, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    if (response.ok) {
      return {
        ok: true,
        status: "connected",
        reason: "upstream healthy",
        hint: null,
        kernelBaseUrl: normalizedBaseUrl,
        kernelHealthPath: normalizedPath,
        latencyMs,
        upstreamStatus: response.status,
      };
    }

    let hint = null;
    if (response.status === 401 || response.status === 403) {
      hint = "Kernel URL is protected or requires auth. Set KERNEL_AUTH_* or disable Deployment Protection for that upstream.";
    } else if (response.status === 404) {
      hint = "Health path may be wrong; expected /api/health.";
    }

    return {
      ok: false,
      status: "degraded",
      reason: `upstream returned ${response.status}`,
      hint,
      kernelBaseUrl: normalizedBaseUrl,
      kernelHealthPath: normalizedPath,
      latencyMs,
      upstreamStatus: response.status,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const errorCode = error?.cause?.code || error?.code;
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: "degraded",
        reason: "timeout",
        hint: "Kernel did not respond within 3s.",
        kernelBaseUrl: normalizedBaseUrl,
        kernelHealthPath: normalizedPath,
        latencyMs,
        upstreamStatus: null,
      };
    }
    if (errorCode === "ENOTFOUND" || errorCode === "EAI_AGAIN") {
      return {
        ok: false,
        status: "degraded",
        reason: "network error",
        hint: "Custom domain DNS not pointed to Vercel yet; use the vercel.app URL or fix DNS.",
        kernelBaseUrl: normalizedBaseUrl,
        kernelHealthPath: normalizedPath,
        latencyMs,
        upstreamStatus: null,
      };
    }
    return {
      ok: false,
      status: "degraded",
      reason: "network error",
      hint: "Network error contacting kernel.",
      kernelBaseUrl: normalizedBaseUrl,
      kernelHealthPath: normalizedPath,
      latencyMs,
      upstreamStatus: null,
    };
  } finally {
    clearTimeout(timeout);
  }
};
