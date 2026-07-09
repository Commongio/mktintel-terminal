# V9 SETUP GUIDE — Multi-Tenant Terminal

V9 is **env-gated**: with no new env vars, the terminal runs exactly like before
(single-user access-code gate, local settings). Add the vars below to unlock
each feature. Everything client-side (bot modes, popups, layouts, personalization,
redundant data) works immediately with zero setup.

---

## 1. Supabase (accounts, registration codes, admin view, settings sync, signal feed)

1. Create a project at https://supabase.com (free tier is fine).
2. SQL Editor → New query → paste the whole of `supabase/migrations/001_v9_init.sql` → Run.
3. (Optional, for the live signal feed) Database → Replication → enable realtime for `public.signals`,
   or run: `alter publication supabase_realtime add table public.signals;`
4. Project Settings → API → copy keys into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        (anon/public key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...            (service_role key — server only, never expose)
OWNER_EMAILS=giovanniflores1491@gmail.com    (comma-separated; unlocks /admin)
```

5. Seed your existing 25 access codes as registration codes (SQL Editor):

```sql
insert into public.registration_codes (code, batch_label)
select unnest(string_to_array('KRN-2VCAPJ,KRN-BLSHGG, ...paste the full list...', ',')), 'original-25';
```

6. Restart the dev server. The gate becomes sign-in/sign-up; sign up with your
   own email + one code, then visit **/admin** to manage codes.

Auth email confirmation is disabled by design (accounts are gated by codes instead).
Supabase → Authentication → Providers → Email: you can leave "Confirm email" off.

## 2. Signal feed cron

- **Vercel:** `vercel.json` already schedules `/api/cron/generate-signals`
  every 5 min, 13:00–21:00 UTC, Mon–Fri (covers US market hours incl. DST slop).
  Add env var `CRON_SECRET=<any-long-random-string>` — Vercel sends it automatically
  as the Authorization bearer for cron invocations.
- **Local test:**
  `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/generate-signals`

## 3. Stripe (billing — Phase E, optional until you're ready to charge)

1. Create products/prices in Stripe (Basic $29, Pro $79, Prop Firm $149 monthly).
2. Add to `.env.local`:

```
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...             (from the webhook endpoint you create)
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PROPFIRM=price_...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

3. Stripe Dashboard → Webhooks → add endpoint `https://<domain>/api/stripe/webhook`
   with events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Client calls `POST /api/stripe/checkout {tier}` (auth required) → redirect to `url`.
   Tier state lands in `public.subscriptions`. Feature-gating by tier is not wired
   yet — deliberate, so you can decide gates after the legal/pricing pass.

⚠ Before charging for signals, do the legal review flagged in PLAN_V9.md
(CTA publisher exemption / Advisers Act publisher exclusion — keep the feed standardized).

## 4. Optional extra data providers (redundant feed)

Already works with zero keys (Yahoo primary). Add any of these to deepen failover:

```
FINNHUB_API_KEY=...        (already set — quotes fallback + news sentiment)
TWELVE_DATA_API_KEY=...    (already set — candles/quotes fallback + cross-validation)
ALPHA_VANTAGE_API_KEY=...  (optional — emergency quotes, 25/day)
```

## What runs without any setup

- Legacy access-code gate (`ACCESS_CODES`) when Supabase vars are absent
- Redundant quotes/candles/technicals (`/api/yf-quotes`, `/api/candles`, `/api/technicals`)
- Mode-aware Kronos (OPT/FUT toggle, mode popups, options-flow agent)
- Broker side-by-side popup flow
- Drag-and-drop layouts, note panels, background photo, chat styling (localStorage)
- Shadow account + paper trading (localStorage, as in V8.2)
