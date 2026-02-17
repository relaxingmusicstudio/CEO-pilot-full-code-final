# Status Checks

Run these curl commands to verify core endpoints:

```bash
curl -i https://<domain>/api/health
curl -i https://<domain>/api/version
curl -i https://<domain>/api/kernel
curl -i https://<domain>/api/db-smoke
```

Expected success fields:

- `/api/health`: `ok`, `status`, `service`, `ts`
- `/api/version`: `ok`, `service`, `version`, `sha`, `ts`
- `/api/kernel`: `ok`, `status`, `reason`, `hint`, `kernelBaseUrl`, `kernelHealthPath`, `latencyMs`, `upstreamStatus`, `ts`
- `/api/db-smoke`: `ok`, `db.write`, `db.read`, `table`, `used_key`
