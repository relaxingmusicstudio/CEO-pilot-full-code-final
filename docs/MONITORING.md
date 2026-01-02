# Monitoring

## Runtime Checks
- `/api/health`: basic JSON heartbeat.
- `/api/build`: deployment identity (commit + build time).
- `/api/_routes`: route map + env presence.
- `/api/diag`: deep diagnostics (env + schema + writes).
- `/api/audit/run`: adversarial audit snapshot.
- `/api/kernel/status`: kernel lock + runtime info.

## Post-deploy Verification
Run after every deploy:
```
node scripts/postdeploy-check.mjs https://pipe-profit-pilot.vercel.app
```
The script fails if any endpoint is non-JSON or returns `ok:false`.

## Ops Tick Runner
Run on a schedule (cron/CI):
```
node scripts/ops-tick.mjs https://pipe-profit-pilot.vercel.app
```
Outputs JSON with check results, circuit state, watchdog status, and safe mode.  
State is stored locally at `.ops/uptime-state.json` (ignored by git).

## Safe Mode + Circuits
- Circuit breakers open after repeated failures and cool down automatically.
- If a critical circuit is open or the watchdog is stale, safe mode is set to `safe`.
- If any circuit is open, safe mode is set to `degraded`.
- Safe mode is surfaced in ops tick output and can be used to block risky actions.
