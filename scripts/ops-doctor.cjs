#!/usr/bin/env node

const { execSync } = require("child_process");

const isMock = process.env.VITE_MOCK_AUTH === "true";
const envs = process.env;

const envCheck = (name, { requiredInMock = false } = {}) => {
  const present = Boolean(envs[name]);
  if (present) return { name, status: "GREEN", message: "present" };
  if (!isMock || requiredInMock) return { name, status: "RED", message: "missing" };
  return { name, status: "YELLOW", message: "missing (mock mode)" };
};

const section = (title, rows) => {
  console.log(`\n## ${title}`);
  rows.forEach((r) => console.log(`- [${r.status}] ${r.name}: ${r.message}`));
};

const nodeVersion = process.version;
const npmVersion = execSync("npm -v").toString().trim();

const envRows = [
  envCheck("SUPABASE_URL"),
  envCheck("SUPABASE_ANON_KEY"),
  envCheck("TWILIO_ACCOUNT_SID"),
  envCheck("TWILIO_AUTH_TOKEN"),
  envCheck("TWILIO_FROM_NUMBER"),
  envCheck("RESEND_API_KEY"),
  envCheck("EMAIL_FROM"),
  envCheck("STRIPE_SECRET_KEY"),
  envCheck("OPENAI_API_KEY"),
  envCheck("GEMINI_API_KEY"),
  envCheck("LLM_ALLOW_DEMO_KEYS", { requiredInMock: false }),
];

const vercelChecklist = [
  "Vercel → Project → Settings → Environment Variables: SUPABASE_URL, SUPABASE_ANON_KEY",
  "Do NOT put provider keys in VITE_*; use server-side env only",
  "Supabase Edge Functions secrets: TWILIO_*, RESEND_API_KEY, EMAIL_FROM, LLM_*",
  "Set VITE_MOCK_AUTH=true locally for mock runs",
];

console.log("Ops Doctor");
console.log(`Mode: ${isMock ? "MOCK" : "LIVE"}`);
console.log(`Node: ${nodeVersion}`);
console.log(`npm: ${npmVersion}`);

section("Env presence", envRows);

console.log("\n## Supabase");
const supabaseReady =
  envRows.find((r) => r.name === "SUPABASE_URL")?.status === "GREEN" &&
  envRows.find((r) => r.name === "SUPABASE_ANON_KEY")?.status === "GREEN";
console.log(`- [${supabaseReady ? "GREEN" : "RED"}] Supabase URL/Anon configured`);

console.log("\n## Vercel checklist (manual)");
vercelChecklist.forEach((item) => console.log(`- [INFO] ${item}`));

const reds = envRows.filter((r) => r.status === "RED").length;
if (!isMock && reds > 0) {
  console.error("\nResult: RED – missing critical env vars.");
  process.exit(1);
}

console.log("\nResult: GREEN/YELLOW – review above. (Mock mode tolerates missing providers.)");
