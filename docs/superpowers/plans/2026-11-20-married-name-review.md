# Married-name Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Owner-only `/married-review` page to confirm NR people whose voter record still has their maiden name.

**Architecture:** User-run SQL builds `asenso.married_name_candidates` and the function `asenso.married_review_decide`. An owner-only API route (service role) lists candidates + per-municipality summary and calls the function. A client page shows the summary and the list.

**Tech Stack:** Next.js 15 App Router, Supabase (asenso schema), shadcn/ui, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-20-married-name-review-design.md`

## Global Constraints
- Production DB: no DDL/writes via MCP. SQL is a file the user runs, with backup values, a check that undoes everything, and a ROLLBACK section.
- Table and function are not reachable by anon/authenticated; only the service role (API route) uses them.
- Owner check (`isOwner`) on both the page and the API route.

## Review Focus
- Person already linked since the script ran → Confirm refuses with a clear message, nothing changes.
- Voter already linked to someone else (another candidate confirmed) → refused; other pending rows for that voter become `superseded`.
- Undo of a confirmed row after someone edited the person → only fields still holding our values are restored.
- Two candidates for one person → confirming one supersedes the other; undo brings it back to pending.
- Non-Ozamiz confirm → AP fields untouched; registered only.

---

### Task 1: SQL — table, populate, decide function
**Files:** Create `supabase/married_name_review.sql`
- [ ] Write the file (STEP 1 table + populate + counts; STEP 2 function; ROLLBACK).
- [ ] Verify the populate SELECT read-only via MCP: per-town counts match the 2026-11-20 run (Ozamiz 486, total ≈ 1,006).
- [ ] Commit.

### Task 2: API route
**Files:** Create `app/api/married-review/route.ts`
**Interfaces:** `GET ?town=&status=` → `{ summary: SummaryRow[], rows: CandidateRow[] }`; `POST { id, decision: 'confirm'|'reject'|'undo' }` → `{ row }`; RPC `married_review_decide(p_id bigint, p_decision text, p_by text) returns jsonb`.
- [ ] Implement; `npm run lint` clean.

### Task 3: Page + menu
**Files:** Create `app/(auth)/married-review/page.tsx`; Modify `components/AppSidebar.tsx` (owner block, red mark).
- [ ] Implement; `npm run lint` and `npm run build` pass. Commit.

### Task 4: After the user runs the SQL
- [ ] Read-only checks: table row counts per town; function exists; the page loads.
