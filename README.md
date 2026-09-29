# Goal Track

German-language insurance sales dashboard with a responsive dark iOS interface, Next.js App Router, TypeScript, Tailwind CSS and Supabase Auth/Postgres. Designed for one invitation-only team and deployment through GitHub to Vercel.

## Run locally

Use Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without Supabase environment variables, the root shows a **clearly labeled interactive demo**. Its sample entries are held only in memory and reset on reload or month change. `/demo` remains available after Supabase is connected. It does not create accounts or write to the database. Production sign-in never falls back to demo data after a database/auth error.

## Connect Supabase

1. Create a Supabase project. Run both files in `supabase/migrations/` in filename order, each once in its own SQL Editor query (or use the Supabase CLI migration workflow). For an existing installation, run only the unapplied migration; see the update instructions below.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the project's Connect dialog. The application uses no service-role key. Restart the local server after changing environment variables.
3. Under Authentication settings, **disable public sign-ups**. Set a minimum password length of 12 and keep email confirmation enabled. Before editing email templates or inviting partners, configure a **custom SMTP provider** under Authentication → Emails → SMTP Settings. Supabase's built-in mail provider is only for limited testing and, on newly created free-tier projects, may not permit custom auth email templates. Review Auth rate limits before launch.
4. Set the Supabase **Site URL** to your canonical app origin (local testing: `http://localhost:3000`; production: your Vercel/custom domain). Allow that origin's `/auth/confirm` and `/auth/password` redirect paths. Keep separate Supabase projects for staging and production.
5. Configure Authentication → Email Templates using these links. They deliberately use the trusted Site URL and token hashes so invitations and password recovery work across browsers and with server-side cookies:

   **Invite user:**
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Goal Track: Zugang einrichten</a>
   ```
   **Reset password:**
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Goal Track: Passwort zurücksetzen</a>
   ```

6. Invite each partner through Authentication → Users → Invite user. The migration creates an **inactive** profile for each account, including existing accounts. Activate the intended partner and set their display name from the trusted SQL Editor:

   ```sql
   update public.profiles
   set full_name = 'Partner Name', active = true
   where id = (select id from auth.users where email = 'partner@example.com');
   ```

   Repeat for each actual partner. Partner accounts cannot activate themselves or change membership through user metadata. To revoke access, set `active = false`; the dashboard, mutations, private rows and leaderboard enforce this membership state. Personal data stays stored until deliberately deleted by the operator.
7. The partner follows the invitation, chooses a password and signs in. Password recovery is available on `/login`. There is no public registration page.

## Data and calculations

- `profiles`: private account profile, display name and operator-managed active membership.
- `monthly_goals`: per-user, per-month targets, with one row per user/month. The baseline is **10,000 BWS** until the user saves a custom target for that month. Goals never carry over implicitly.
- `sales_entries`: positive BWS amounts with two decimal places, one of seven insurance categories, transaction type (`Neuvertrag` or `Vertragsumstellung`), actual completion date and an optional short note. Historical Kfz records remain readable and counted. Historical transaction types are unknown (`NULL`), displayed as “Altbestand · Vertragsart nicht erfasst”. New writes reject Kfz and explicitly null/invalid transaction types. The form asks users not to include customer or contract data. Future-dated entries are blocked in both the server action and database.
- `team_leaderboard(date)`: narrowly scoped authenticated aggregate function. Exposes active partners' names, IDs, BWS totals, targets and entry counts for the selected month. It never returns their individual records, categories, notes or email addresses. It intentionally uses `SECURITY DEFINER`, a fixed empty search path, an explicit membership check and restricted execute grants.
- Row-level security and column/table grants protect private rows. No client-supplied user ID is trusted by server actions; the server verifies the current user. Database policies independently enforce ownership and membership, including direct API calls.
- **BWS Gesamt** = sum of that month's entries. **Noch offen** = max(target − achieved, 0). **Progress** = achieved ÷ target × 100.
- **Monatsziel der Agentur** = sum of all active partners' targets for the selected month (10,000 BWS per partner without a saved goal). Agency progress = their combined monthly BWS ÷ combined targets. Inactive partners are excluded. Percentages may exceed 100%; the bar caps at 100% and remaining BWS at zero.
- **Tagessieg** = highest positive BWS total with today's `occurred_on` date in Europe/Berlin. Every tied leader gets the badge; zero sales produces no winner. This is the current lead, not an archived award. It is independent of the selected month. `team_daily_leaderboard()` calculates the date inside Postgres on every call and exposes only member names, IDs, daily totals and the Berlin date. Backdated entries affect their month, not today's ranking. No scheduled reset is needed: the next refresh after Berlin midnight uses the new day, including DST and year boundaries.
- **Prognose** = achieved ÷ elapsed calendar days × days in month. Its percent is projected BWS ÷ target × 100. Past months use their actual final total. Remaining daily BWS uses the remaining calendar days after today; on the last day it shows what is needed today. Calendar boundaries use Europe/Berlin.
- After a successful add/delete or goal change, the UI recalculates and reloads authoritative server data immediately. Other connected partners see new team totals on the next **15-second refresh**, or immediately when refocusing the app. Hidden tabs do not poll. Monthly history is isolated by sale date. All active partners appear even with zero sales.
- Each add-entry modal uses one UUID throughout retries to avoid duplicate entries after an ambiguous network response. Entries can be deleted with confirmation; corrections are made by deleting and re-entering.

## Deploy on Vercel with GitHub

1. Create a GitHub repository and push this project, including `package-lock.json`. Do not commit `.env.local`.
2. Import the repository in Vercel. Framework: **Next.js**. Use Node.js 24.x, install command `npm ci`, build command `npm run build`, and the default Next.js output directory.
3. Add the two Supabase environment variables for Production (and your staging credentials for Preview if needed). Deploy.
4. Set the production Supabase Site URL and redirect allowlist to the deployed origin. Configure the email templates/SMTP above and test invitation and recovery links with actual partner mailboxes.
5. Vercel automatically builds deployments on GitHub pushes; the production branch updates production and pull requests receive previews. `.github/workflows/ci.yml` runs tests and the production build on pushes and PRs.

No Vercel, GitHub or Supabase account was provisioned automatically. The build succeeds without credentials; actual private accounts and durable cross-user data require the setup above.

## Update an existing production installation (29 September 2026)

1. Run **only** `supabase/migrations/202609290001_team_performance.sql` in a **new** Supabase SQL Editor query. The migration is atomic and should be applied once. Do not append it to or rerun the original schema. No sales entries are deleted, recategorized, or assigned an invented historical transaction type.
2. Publish the updated source and lockfile to the existing GitHub production branch, including the new migration and `eslint.config.mjs`. Vercel runs the existing `npm run build` command, which now checks lint before compiling. No new environment variables, service-role key, SMTP or Realtime configuration are needed.
3. Wait for Vercel's deployment to be Ready, then open `https://goalcheck.vercel.app`. Verify both transaction types in the form and persistence after reloading. Check a historical Kfz record if present, the team agency goal, and the daily badge.
4. With two real active accounts, save an entry under account A and verify account B's team total/agency progress/daily result changes within 15 seconds or on refocus. Change A's target and verify the combined target changes. Remove the test entry when finished.

The new category check and transaction-type-required check deliberately use PostgreSQL `NOT VALID`: existing Kfz/unknown-type rows are grandfathered, while new inserts and updates must meet the checks. Do not validate these constraints without first deciding how to handle the historical records. All original RLS policies remain in place. A new row from a pre-update client that omits transaction type defaults to Neuvertrag during rollout; the updated client always supplies a validated type. Old clients can no longer submit Kfz, so refresh browsers after deployment.

If deployment fails, fix and redeploy the frontend; keep the additive migration. The previous monthly aggregate function is unchanged, so the previous frontend remains readable. Do not rerun the first migration or delete historical data to resolve a rollout issue.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Automated tests cover calculations, decimal precision, date boundaries, leaderboard reordering and invalid inputs. Database tests execute the migration in an isolated PostgreSQL-compatible PGlite database to exercise row ownership, membership, aggregate totals and direct API-style writes. They emulate Supabase's `auth.uid()` and roles, not Supabase email delivery or the hosted Auth service. Browser tests verify entry creation, goal changes, leaderboard updates, filtering, deletion and login/recovery screens at desktop and iPhone-sized viewports. They use installed Microsoft Edge on Windows; on Linux, first run `npx playwright install --with-deps chromium`. CI runs these browser tests too.

The `--webpack` compiler option is intentional: it avoids a Turbopack incompatibility with Windows OneDrive reparse points in this workspace and is also supported on Vercel. Dependencies are pinned and the lockfile is committed-ready for reproducible installs. `npm run format` formats source files.

Before production use, verify with two real invited accounts: add an entry as A, confirm A's metrics and B's team table update; confirm B cannot read/delete A's detail rows; reload to confirm persistence; change a monthly goal; test password recovery, mobile layout, account deactivation and the next-month boundary. Configure Supabase backups/retention and operational monitoring to match your team's needs.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
