#!/usr/bin/env node

const { execSync } = require("child_process");

const runSafe = (cmd, opts = {}) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch (_err) {
    return null;
  }
};

const requireGh = () => {
  const ghVersion = runSafe("gh --version");
  if (!ghVersion) {
    console.error("GitHub CLI not found. Install: https://cli.github.com/ and run `gh auth login`.");
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

  const infoJson = runSafe("gh pr view --json url,number,mergeableState,statusCheckRollup,headRefName,baseRefName");
  if (!infoJson) {
    console.error("No PR found for current branch. Create one first (npm run pr:open).");
    process.exit(1);
  }

  const info = JSON.parse(infoJson);
  const checkState = info.statusCheckRollup?.state || "UNKNOWN";
  const mergeable = info.mergeableState || "UNKNOWN";

  if (mergeable !== "MERGEABLE") {
    console.error(`PR not mergeable: state=${mergeable}`);
    process.exit(1);
  }
  if (checkState !== "SUCCESS") {
    console.error(`Checks not green: status=${checkState}`);
    process.exit(1);
  }

  console.log(`Merging PR ${info.number || ""} -> ${info.baseRefName || "main"} ...`);
  execSync("gh pr merge --squash --delete-branch", { stdio: "inherit" });
};

try {
  main();
} catch (err) {
  console.error("pr:merge failed:", err?.message || err);
  process.exit(1);
}
