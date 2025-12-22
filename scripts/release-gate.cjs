#!/usr/bin/env node

const { execSync } = require("child_process");

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
};

const withMockEnv = { env: { ...process.env, VITE_MOCK_AUTH: "true" } };

try {
  // Optional: npm ci (kept for consistency)
  run("npm ci");

  // Build + tests in mock mode
  run("npm run build", withMockEnv);
  run("npm run test:e2e", withMockEnv);
  run("npm run ops:doctor", withMockEnv);

  // Collect metadata for PR template
  const commit = execSync("git rev-parse HEAD").toString().trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  let files;
  try {
    files = execSync("git diff --name-only origin/main...HEAD").toString().trim();
    if (!files) throw new Error("empty");
  } catch {
    files = execSync("git diff --name-only HEAD~1..HEAD").toString().trim();
  }

  console.log("\n---- PR DESCRIPTION (copy/paste) ----");
  console.log(`# Summary\n- \n`);
  console.log(`# Files Changed\n${files.split("\n").map((f) => `- ${f}`).join("\n")}\n`);
  console.log(`# Proof Gate (attach raw outputs)\n- [x] npm ci\n- [x] VITE_MOCK_AUTH=true npm run build\n- [x] VITE_MOCK_AUTH=true npm run test:e2e\n- [x] VITE_MOCK_AUTH=true npm run ops:doctor\n- [x] npm run release:gate\n`);
  console.log(`# Risk / Rollback\n- Risk: \n- Rollback: revert commit ${commit}\n`);
  console.log(`# Commit / Branch\n- Commit: ${commit}\n- Branch: ${branch}\n`);
  console.log(`# Screenshots (optional)\n- \n`);
} catch (err) {
  console.error("\nRelease gate failed:", err?.message || err);
  process.exit(1);
}
