# Backups (M15)

Supabase daily backups are dashboard-side — there is nothing to code. This page records
where they live, what to verify weekly, and how to restore.

## Where backups live

Supabase Dashboard → select the project → **Database → Backups**.

- Automatic daily backups are taken by Supabase; retention length depends on the plan.
- **PITR (Point-In-Time Recovery) is plan-dependent**: not available on all plans.
  Check Database → Backups → "Point in Time" section to confirm whether PITR is
  enabled for this project, and upgrade the plan if RPO requires it.

## Weekly verification checklist

1. Open Database → Backups and confirm a backup completed in the last 24h.
2. Confirm retention window covers the project's RPO (e.g. 7 days minimum).
3. Confirm PITR status matches expectations (enabled or consciously off).
4. Hit `GET /api/health` (or check UptimeRobot) and confirm
   `checks.products.ok === true` — proves the live `products` table is readable.
5. After any migration (`supabase/*.sql`), take a manual snapshot (see below).

## Restore steps

1. Go to Database → Backups, pick the restore point, and follow the dashboard flow.
2. Restoring replaces live data — announce downtime first; the shop falls back to
   the bundled catalog in `src/data/factories.ts` only for reads that tolerate it.
3. After restore: verify `/api/health` returns `ok: true`, spot-check the catalog
   (`GET /api/products`), and confirm checkout flow in preview before announcing recovery.
4. If PITR is enabled, you can instead restore to a specific timestamp within the
   PITR window — same page, "Restore to a point in time".

## Manual snapshots (pg_dump template)

Get the connection string from Supabase Dashboard → Settings → Database
(use the pooler URL for local networks). Never commit it to the repo.

```bash
# Custom-format dump, timestamped:
pg_dump "$DATABASE_URL" -Fc -f "backup-$(date +%F).dump"

# Restore into a target database:
pg_restore -d "$TARGET_DATABASE_URL" --clean --if-exists "backup-YYYY-MM-DD.dump"
```

Store manual dumps outside the repo (encrypted drive / team vault), and test-restore
at least once — an untested backup is not a backup.
