## Ops Playbook

### Quick commands
- Proof Gate: `npm run proofgate`
- Ops Doctor: `npm run ops:doctor`

### Environments
- **Mock mode** (default for local tests): set `VITE_MOCK_AUTH=true`; external providers are stubbed.
- **Live mode**: ensure all server env vars are set (see docs/APIS.md), then run Proof Gate.

### Deployment steps
1) Run `npm run proofgate` locally; fix any failures.
2) Verify `npm run ops:doctor` shows GREEN/YELLOW only (no RED in live).
3) Push branch; GitHub Actions runs the same proofgate.
4) Before go-live, set server env vars on Vercel and Supabase (no provider keys in `VITE_*`).

### Troubleshooting
- Missing envs: use `npm run ops:doctor` to see which are absent.
- Secret leaks: proofgate scans `dist` for `sk-` and `AIza` and fails if found.
- Mock vs live confusion: check `/app/ops` for current mode and checklist.
