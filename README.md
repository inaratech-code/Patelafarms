# Patela Farms

Patela Farm is a modern farm inventory management system built for Dhangadhi, Nepal. It features stock tracking, sales, purchases, ledger, day book, user roles, alerts, and offline-first support. Designed with a clean SaaS dashboard UI, smooth UX, responsive layouts, and automation to simplify daily farm business operations.

## Getting started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase (optional, for multi-device sync)

1. Create a Supabase project.
2. **Authentication → Providers → Anonymous** — turn **Anonymous sign-ins** **on** and save. (The app uses `signInAnonymously()` so sync has an `auth.uid()` for row-level security.)
3. Run the SQL scripts in the Supabase **SQL Editor** (new query, run each file in order):
   - `supabase/events.sql`
   - `supabase/tenancy_rls.sql`
   - **`supabase/fix_farms_rls_v2.sql`** (required if you see *“new row violates row-level security policy for table farms”* — fixes `farms` / `farm_members` policies and grants for the `authenticated` role.)
   - **`supabase/join_farm.sql`** (adds `join_code` on farms + `join_farm()` RPC so a second browser can join the same farm and sync users/data.)
   - **`supabase/fix_is_farm_member_rls_recursion.sql`** (if you see *stack depth limit exceeded* / `54001` when reading `farms` — makes `is_farm_member` `SECURITY DEFINER` so RLS policies do not recurse.)
   - **`supabase/farm_cloud_logins.sql`** (same **username + password** on a new browser joins the farm without Farm ID / join code — required for that login flow.)
4. Create `.env.local` (not committed) with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Reload the app, then use **Settings → Sync**. Sign in once on the primary device so your password is registered for other browsers; new devices use **Login** with the same username and password (internet required for that first sign-in).

If you previously saw **duplicate key … events_pkey** on sync, update the app and sync again; pulled events are no longer re-pushed to Supabase.

### If sync still fails after the above

- Confirm `.env.local` points at the **same** Supabase project where you ran the SQL.
- In the SQL Editor, confirm `public.is_farm_member` exists; if not, re-run `tenancy_rls.sql` before `fix_farms_rls_v2.sql`.
- Clear site data for this app (or wait for a fresh anonymous session) and try sync again.
