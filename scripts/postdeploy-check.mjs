const input = process.argv[2];
const envUrl = process.env.VERCEL_URL;

const resolveBase = () => {
  if (input) return input;
  if (envUrl) {
    if (envUrl.startsWith("http")) return envUrl;
    return `https://${envUrl}`;
  }
  return "https://pipe-profit-pilot.vercel.app";
};

const base = resolveBase().replace(/\/+$/, "");

const checks = [
  { id: "health", path: "/api/health" },
  { id: "build", path: "/api/build" },
  { id: "routes", path: "/api/_routes" },
  { id: "diag", path: "/api/diag" },
  { id: "audit", path: "/api/audit/run" },
  { id: "kernel", path: "/api/kernel/status" },
];

const parseJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const run = async () => {
  const results = [];
  let ok = true;

  for (const check of checks) {
    const url = `${base}${check.path}`;
    try {
      const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      const raw = await response.text();
      const parsed = parseJson(raw);
      const jsonOk = parsed && parsed.ok !== false;
      const pass = response.ok && jsonOk;
      results.push({
        id: check.id,
        url,
        status: response.status,
        ok: pass,
        error: pass ? null : parsed?.error || parsed?.errorCode || "non_json",
      });
      if (!pass) ok = false;
    } catch (error) {
      results.push({
        id: check.id,
        url,
        status: 0,
        ok: false,
        error: error instanceof Error ? error.message : "fetch_failed",
      });
      ok = false;
    }
  }

  console.log(JSON.stringify({ ok, base, checks: results }, null, 2));
  if (!ok) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error("[postdeploy] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
