# Chinese Takeout — Website & Online Ordering (Tier B)

Astro (Vite) + React islands + TypeScript + Tailwind, self-hosted Postgres 16,
Drizzle migrations. Pay-at-pickup only; no card processing. Built from the
implementation plan (1 Aug 2026) **with every addendum fix included** — see
the checklist at the bottom.

## Surfaces

| URL | What | Auth |
|---|---|---|
| `/` | Marketing page + full crawlable HTML menu + JSON-LD | public |
| `/order` | Interactive menu, cart, checkout (guest only) | public |
| `/kitchen` | Order queue: Accept / Ready / Picked up / Reject, repeating chime | kitchen device cookie |
| `/admin` | Pause switch, wait time, price edit, 86 toggles, blocklist | owner session |
| `/api/health` | DB-checked health endpoint for the external uptime monitor | public |

## Local development

```bash
cp .env.example .env        # then edit values (at least ADMIN_PASSWORD, KITCHEN_TOKEN)
docker compose up -d        # Postgres 16 on localhost:5432
npm install
npm run db:push             # create tables (dev; use generated migrations for prod)
npm run db:seed             # load data/menu-seed.json + create owner account
npm run dev                 # http://localhost:3000
```

Notifications default to `NOTIFY_MODE=console` — **nothing real is ever sent
in development**; every attempt is printed and logged to `notification_log`.

- Kitchen tablet enrollment: open `http://localhost:3000/kitchen?token=<KITCHEN_TOKEN>`
  once on the device; a long-lived cookie is set. Rotate `KITCHEN_TOKEN` to revoke all devices.
- Admin: `http://localhost:3000/admin` (username/password from `.env`, seeded once).

## Editing the menu

`data/menu-seed.json` is the seed source (export the owner's spreadsheet into it).
`npm run db:seed` wipes and reloads menu/config tables — it never touches orders.
Day-to-day price changes and 86ing happen in `/admin`, not in the seed file.

## Order lifecycle (Addendum B1)

```
new ──Accept──▶ acknowledged ──Ready──▶ ready ──▶ picked_up
 │                                        └─────▶ no_show   (feeds blocklist)
 ├──Reject──▶ rejected   (customer gets "please call us" SMS)
 └──(staff)─▶ canceled
```

The customer is never told "confirmed" until a human taps Accept. Escalation
(3 min → resend owner SMS, 6 min → second number) and the kitchen-screen
heartbeat run on a 60s in-process ticker.

## Production (DigitalOcean droplet)

1. Harden first: SSH keys only, root login off, `ufw` (22/80/443), `fail2ban`,
   `unattended-upgrades`.
2. Build the image **off-box** and push: `docker build -t ghcr.io/you/chinese-takeout .`
3. On the droplet: `.env.production` (mode 600), then
   `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`
4. Migrations as an explicit deploy step: `npm run db:generate` locally (commit
   the `drizzle/` folder), apply with `npm run db:migrate` against the droplet DB.
5. Edit `Caddyfile` with your domain — TLS is automatic.
6. Backups: `scripts/backup.sh` in cron nightly + DO droplet backups. **Restore-test
   once before the first real order.**
7. Point an external uptime monitor (UptimeRobot / Better Stack free tier) at
   `/api/health`, alerting the owner AND the developer (Addendum B3).
8. Cloudflare: proxy (orange cloud) ON from day one; SSL mode "Full (strict)".
   Rate limiting already reads `CF-Connecting-IP` (Addendum B4).
9. Twilio: register A2P 10DLC **weeks early**; set the inbound webhook for the
   number to `POST /api/sms/inbound` (Addendum B5). Before `NOTIFY_MODE=live`,
   add signature validation in `src/pages/api/sms/inbound.ts` (marked TODO).
10. Keep the static Tier D fallback page on Cloudflare Pages; document the DNS
    flip in the printed runbook.

## Addendum fixes included

- **B1** Full order lifecycle + Reject/cancel/no-show flows, customer lifecycle SMS
- **B2** `/kitchen` requires a device token — it shows customer PII
- **B3** `/api/health` for external uptime monitoring (in-process heartbeat can't report its own death)
- **B4** `CF-Connecting-IP`-aware rate limiting (per-IP + max 2 open orders per phone)
- **B5** Inbound SMS webhook — replies forward to the owner, never land in silence
- **B6** Checkout SMS opt-in language + `/privacy` page (A2P 10DLC compliance)
- **A5** SMS treated as a weak filter; blocklist + (future) callback threshold are the real defense
- Plus the plan's own non-negotiables: server-side re-pricing, integer cents,
  snapshotted order rows, idempotent submit, split-service hours with last call,
  IANA-timezone evaluation, real fieldsets/labels, sold-out modifiers ≠ sold-out dish.

## What is deliberately NOT here (Phase 2)

Card payments, delivery, accounts, scheduled orders beyond +45 min, reorder by
phone lookup, POS integration, reporting dashboards. The schema already carries
`fulfillment_type` and integer cents so none of these require a migration of
live order history.
