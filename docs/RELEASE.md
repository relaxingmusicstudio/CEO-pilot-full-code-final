# Release / PR flow (CLI-first)

## GitHub CLI
1) Login once:
   ```
   gh auth login
   ```
2) Create PR from current branch:
   ```
   gh pr create --fill
   ```
3) Merge when green:
   ```
   gh pr merge --squash --delete-branch
   ```

## If not using GitHub CLI
- Web UI: Open the repo → Compare & pull request → Create pull request → Merge (Squash) → Delete branch.

## Proof Gate commands (run before PR/merge)
- `npm ci`
- `VITE_MOCK_AUTH=true npm run build`
- `VITE_MOCK_AUTH=true npm run test:e2e`
- `VITE_MOCK_AUTH=true npm run ops:doctor`
- `npm run release:gate`
