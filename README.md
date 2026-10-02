# Daymark

Daymark is a responsive task-management app built with SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS, Supabase Auth/Postgres, Supabase Realtime, Zod, and Anthropic Claude. The app is deployed with the Vercel adapter.

## Features

- Email/password and Google sign-in; protected, user-owned workspaces
- Projects, task CRUD, priorities, statuses, due dates, reminders, tags, subtasks, and recurring tasks
- Kanban and list views, drag-and-drop ordering, search, filters, overdue emphasis, and live updates
- Light/dark theme, responsive layout, and `N` / `Ctrl+K` keyboard shortcuts
- Server-only AI quick add, task breakdown, prioritization, daily/weekly summaries, auto-tags/time estimates, and streaming task-aware assistant
- PostgreSQL Row Level Security on every application table

Browser reminders use the Web Notifications API and run only while Daymark is open in a supported browser. They are not background push notifications and do not fire when the app/browser is closed.

## Local setup

Requirements: Node.js 20+ and a Supabase project.

1. Install packages and create a local environment file:

   ```sh
   npm install
   Copy-Item .env.example .env
   ```

2. Set the variables in `.env`:

   ```dotenv
   PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=<Supabase publishable/anon key>
   PUBLIC_APP_URL=http://localhost:5173
   ANTHROPIC_API_KEY=<Anthropic API key>
   ANTHROPIC_MODEL=claude-3-5-haiku-latest
   ```

   The Anthropic key is read only from `$env/dynamic/private` in server modules. Never use a `PUBLIC_` prefix for it. No service-role key is required or used. AI features return a configuration error until the key is set; the rest of the app can still build without it.

3. In the Supabase SQL Editor, run `supabase/migrations/202610020001_initial_schema.sql`. This creates profiles, default projects, tasks, subtasks, tags, task-tag links, AI usage accounting, indexes, triggers, and RLS policies.
4. In Supabase **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and allow `http://localhost:5173/auth/callback`. For Google login, enable the Google provider and add the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the OAuth client’s authorized redirect URIs; add the Google client ID/secret to Supabase.
5. Start the app:

   ```sh
   npm run dev
   ```

   Visit [http://localhost:5173](http://localhost:5173). `npm run check` runs Svelte/TypeScript checks; `npm run build` creates the production build.

## Deployment

The project uses `@sveltejs/adapter-vercel`. Import the repository into Vercel and configure the same environment variables for the deployment environment. Set `PUBLIC_APP_URL` to the deployed origin and allow `<deployed-origin>/auth/callback` in Supabase Auth’s redirect URLs. Confirm the Google OAuth consent screen and redirect URI use the production Supabase callback. Deploy with Vercel’s standard SvelteKit build.

## Architecture

- `src/hooks.server.ts`: request-scoped Supabase SSR client, verified user, and protected-route redirects.
- `src/routes/app/+page.server.ts`: authenticated task/project/subtask loads and progressive-enhancement form actions.
- `src/routes/api/ai/**/+server.ts`: authenticated, Zod-validated AI endpoints; Claude is called only by `src/lib/server/ai/service.ts`.
- `src/lib/schemas`: shared input/output schemas; `src/lib/server`: server-only provider code; `src/lib/components` and `src/lib/stores`: reusable UI and Svelte 5 state.
- `supabase/migrations`: database schema, ownership policies, recurrence/task RPCs, AI rate-limit accounting, and Realtime publication.

All task queries use the authenticated Supabase client and rely on RLS for ownership enforcement. AI calls are capped at 20 per user per hour; usage reservations are serialized in Postgres.
