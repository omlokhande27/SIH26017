# LandGuard AI

A React + TypeScript single-page application for land-acquisition risk monitoring, prediction review, and recommended action tracking.

## Prerequisites

- Node.js 22.22+
- npm
- A Supabase project for authentication

## Setup

```bash
npm install
copy .env.example .env
```

Update `.env` with the Supabase project URL and publishable key:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Use the Supabase project root URL; do not append `/rest/v1`.

## Required Supabase setup

Run [`supabase/migrations/20260925000100_fix_auth_profiles.sql`](supabase/migrations/20260925000100_fix_auth_profiles.sql) once in **Supabase Dashboard → SQL Editor**. Then run [`supabase/migrations/20260926000100_allow_profile_display_updates.sql`](supabase/migrations/20260926000100_allow_profile_display_updates.sql) to enable the profile editor in the avatar menu. The migrations:

- Adds the missing government ID and designation profile fields
- Backfills profiles for existing Authentication users
- Automatically creates a safe `VIEWER` profile for new signups
- Adds the RLS policy that lets users read only their own profile
- Prevents users from promoting their own role through the browser
- Allows users to update their own name, department, and designation while protecting role and government ID fields

Afterward, promote approved officers from the Supabase admin interface by setting `profiles.role` and `profiles.government_id`. Do not expose or commit a service-role key.

For password recovery, add these URLs under **Supabase → Authentication → URL Configuration → Redirect URLs**:

```text
http://localhost:5173/reset-password
https://your-production-domain.example/reset-password
```

The reset link is sent with `supabase.auth.resetPasswordForEmail`; the `/reset-password` page updates it with `supabase.auth.updateUser`.

### Email confirmation rate limit

If **Create Account** reports an email rate-limit error, the limit is enforced by the Supabase Auth project rather than the React form. The portal now shows a clear confirmation-limit message instead of the raw server error.

To increase the limit, open **Supabase Dashboard → Authentication → Rate Limits** and raise **Email sent** for the project. For production deployments, configure a custom SMTP provider under **Authentication → SMTP**; the built-in SMTP service is intended for development and has delivery restrictions. Keep email confirmation enabled for a government portal, and never place a service-role or Management API token in the frontend.

### Password reset email

The portal sends a Supabase recovery email with a one-time link. To give the email the LandGuard branding and clear instructions, open **Supabase Dashboard → Authentication → Email Templates → Reset password**, set the subject to `Reset your LandGuard AI password`, and paste the contents of [`supabase/email-templates/reset-password.html`](supabase/email-templates/reset-password.html).

The recipient should click **Choose a new password** in the email. The link opens `/reset-password`, verifies the recovery session, and shows the password form. Expired or already-used links return the user to sign in to request a fresh email.

## Commands

```bash
npm run dev      # Start the Vite development server
npm run build    # Type-check and create the production bundle
npm run lint     # Run Oxlint
npm run preview  # Serve the production bundle locally
```

## Authentication and roles

Users authenticate through Supabase. Display details can come from Supabase user metadata, but roles are accepted only from trusted `app_metadata.role` data or the user's `profiles` row. Users without a trusted role default to `VIEWER`. A profile row may provide `full_name`, `role`, `department`, `designation`, and `government_id` (or `employee_id`).

The login screen has two Supabase-backed paths:

- **Existing Account** — calls `supabase.auth.signInWithPassword` and asks for Viewer or Government Officer workspace access.
- **Create Account** — calls `supabase.auth.signUp`. New accounts always start as `VIEWER`; users cannot self-assign officer permissions.

The optional government-ID check compares the entered ID with the trusted profile value before officer controls are enabled.

- **General Viewer** — dashboards, projects, maps, analytics, and recommendations are available in read-only mode.
- **Government Officer** — management controls are enabled for accounts assigned an officer or project-manager role. Officers can create and edit project records, run predictions, manage recommendations, and generate reports. An account without those trusted permissions automatically falls back to viewer mode.
- **Viewer information updates** — viewers can opt into in-portal and browser notifications for project and risk information. This preference does not grant any data-editing permission.
- **Account panel** — the user avatar dropdown shows identity, role, workspace mode, notification status, Supabase session state, and the previous portal visit without opening a separate account-settings page. Users can edit their display name, department, and designation, request a password-reset email, and manage notification preferences there. The officer-only **Administration** view summarizes workspace security and monitoring controls; it is not an account editor.

Supported role values are:

- `GOVERNMENT_OFFICER`
- `PROJECT_MANAGER`
- `WORKER`
- `VIEWER`

The current project and analytics screens use mock domain data while Supabase provides authentication.

### Command Center data contract

The dashboard command center derives its metrics, risk distribution, and early-warning cases from the existing `Project` records and prediction/recommendation layers. The current project model does not contain an actual-delay field, a model-estimated additional-cost field, or village/parcel-level coordinates for every case; those values are shown as unavailable rather than invented. The current prediction layer is explicitly marked as demo output until a live ML/API service is connected.

## Production deployment

The app uses client-side routing. Configure the hosting provider to rewrite unknown routes to `index.html` so routes such as `/dashboard`, `/projects/proj_1`, and `/reset-password` load correctly on refresh.
