# Twilio A2P / SMS Readiness

## What to know
- A2P registration is required for long-code SMS in the US.
- Until approved, carriers can block or rate-limit messages.
- Our notify-gateway supports a **mock** mode; use it when unsure.

## Minimum to test in mock mode
- Set `VITE_MOCK_AUTH=true` locally.
- Do **not** need Twilio credentials; notify-gateway returns `mock-sent`.

## Minimum to go live
1) Register brand and campaign in Twilio.
2) Purchase a sending number (E.164 format) and set:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`
3) Deploy secrets to Supabase Edge Functions (not VITE_*).
4) Re-run `npm run proofgate` and `npm run ops:doctor`.

## If A2P is pending
- Use a toll-free number as a temporary path.
- Keep `allowLive` off in notify-gateway until approved.
- Monitor `notify_events` for `mock-sent` vs `sent`.

## Fallbacks
- Voice calls can work without A2P.
- Email confirmations (Resend) are unaffected; keep a verified sender set.
