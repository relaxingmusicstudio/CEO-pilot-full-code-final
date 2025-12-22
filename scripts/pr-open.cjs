#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");

const runSafe = (cmd, opts = {}) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch (err) {
    return null;
  }
};

const requireGh = () => {
  const ghVersion = runSafe("gh --version");
  if (!ghVersion) {
    console.error("GitHub CLI not found. Install: https://cli.github.com/ and rerun `gh auth login`.");
    process.exit(1);
  }
  const auth = runSafe("gh auth status");
  if (!auth) {
    console.error("GitHub CLI not authenticated. Run: gh auth login");
    process.exit(1);
  }
};

const main = () => {
  requireGh();

  const branch = runSafe("git rev-parse --abbrev-ref HEAD");
  const base = "main";

  console.log(`Running release gate to generate PR body (branch: ${branch}, base: ${base})...`);
  execSync("npm run release:gate", { stdio: "inherit", env: { ...process.env, VITE_MOCK_AUTH: "true" } });

  const bodyFile = ".release-gate-output.md";
  let body = "";
  if (fs.existsSync(bodyFile)) {
    body = fs.readFileSync(bodyFile, "utf8");
  } else {
    body = "# Summary\n- \n\n# Proof Gate\n- attach outputs\n";
  }

  let prUrl = runSafe("gh pr view --json url --jq .url");
  if (prUrl) {
    console.log("PR exists; updating body...");
    execSync(`gh pr edit --body-file ${bodyFile}`, { stdio: "inherit" });
  } else {
    console.log("No PR found; creating...");
    execSync(`gh pr create --title "${branch}" --base ${base} --body-file ${bodyFile}`, { stdio: "inherit" });
    prUrl = runSafe("gh pr view --json url --jq .url");
  }

  if (bodyFile && fs.existsSync(bodyFile)) {
    // Keep file for reuse; not deleted here.
  }

  console.log(`PR URL: ${prUrl || "gh pr view"}`);
};

try {
  main();
} catch (err) {
  console.error("pr:open failed:", err?.message || err);
  process.exit(1);
}
