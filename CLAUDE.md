# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint check
```

## Architecture

**Next.js 15 App Router** full-stack application for census/household data management. Uses the `(public)` and `(auth)` route groups for unauthenticated and authenticated routes respectively.

### Backend & Database

- **Supabase** (PostgreSQL) with a custom `asenso` schema — all Supabase clients are configured to use this schema
- Three Supabase client variants in `lib/supabase/`: `client.ts` (browser), `server.ts` (server components/actions), `admin.ts` (service role for admin ops)
- No ORM — all database access is via Supabase client queries directly
- Auth via **Google OAuth** through Supabase Auth; callback handled at `/auth/callback`

### Frontend State & UI

- **Redux Toolkit** for client state — slices in `lib/redux/` (user, location, locations, households, stocks, list)
- Custom typed hooks: `useAppDispatch` and `useAppSelector` in `lib/redux/hook.ts`
- **shadcn/ui** (New York style) with Radix UI primitives — component config in `components.json`
- **Tailwind CSS v4** with CSS variable theming
- Forms use **React Hook Form + Zod** validation

### Key Data Model

The core domain is hierarchical: **Location** > **Household** > **Family** > **FamilyMember**, with **Voter** records linked to family members. **ServiceProvider** entities are associated with locations and households.

All TypeScript interfaces are centralized in `types/index.ts`.

### Auth & Authorization

Three user types with escalating access: regular **User** (location-scoped via `location_users` join table), **Province Admin**, and **Super Admin**. The `AuthGuard` component in `components/AuthGuard.tsx` gates all `(auth)` routes.

### Environment Variables

Required `NEXT_PUBLIC_` vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY`, `RESEND_KEY`, `ORG_ID`, `BASE_URL`, `MAINTENANCE_MODE`.

### Data Import/Export

Excel import/export via `xlsx` and `papaparse`. PDF generation via `jspdf` + `jspdf-autotable`. Printable components live in `components/Printables/`.
