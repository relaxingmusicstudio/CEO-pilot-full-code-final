import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("Missing required env vars:", missing.join(", "));
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const baseUrl = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
const url = `${baseUrl}/rest/v1/visitors?select=visitor_id&limit=1`;

try {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  const text = await response.text();
  const snippet = text.length > 500 ? `${text.slice(0, 500)}...` : text;

  console.log("Supabase REST status:", response.status);
  console.log("Response snippet:", snippet || "(empty)");

  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error("Supabase fetch failed:", error instanceof Error ? error.message : "unknown");
  process.exit(1);
}
