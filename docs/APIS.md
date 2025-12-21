## APIs and Where to Configure Them

### Gemini / OpenAI
- Purpose: LLM responses via `llm-gateway`.
- Configure secrets server-side (Supabase Edge Functions): `GEMINI_API_KEY`, `OPENAI_API_KEY`, `LLM_ALLOW_DEMO_KEYS`, `LLM_LIVE_CALLS_DEFAULT`.
- In-app: `/app/integrations` stores per-user encrypted keys (optional).
- Minimum (mock): none.
- Minimum (live): server secrets above.

### Resend (Email)
- Purpose: notification emails via `notify-gateway`.
- Configure on Supabase Edge Functions: `RESEND_API_KEY`, `EMAIL_FROM`.
- Minimum (mock): none.
- Minimum (live): `RESEND_API_KEY`, `EMAIL_FROM`.

### Twilio (SMS)
- Purpose: SMS notifications via `notify-gateway`.
- Configure on Supabase Edge Functions: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- Minimum (mock): none.
- Minimum (live): all three above.

### Stripe
- Purpose: payments (future).
- Configure on server (Vercel/Supabase): `STRIPE_SECRET_KEY`.
- Minimum (mock): none.
- Minimum (live): secret key.

### Supabase
- Purpose: data + functions.
- Vercel Project → Settings → Environment Variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- Minimum (mock): URL + anon key.
- Minimum (live): same.

### Location summary
1) **Vercel**: Project → Settings → Environment Variables (server secrets above).
2) **In-app**: `/app/integrations` (per-user encrypted keys when supported).
3) **Supabase Edge Functions**: Secrets for `llm-gateway` and `notify-gateway` (provider keys, EMAIL_FROM, LLM flags).
