# Married-name review (NRs) — short design

**Why.** Married women are often NR in the census because `asenso.voters` still
has their maiden name. The census name `CRUZ, MARIA SANTOS` (married) matches
the voter `SANTOS, MARIA …` (maiden): same first name, census middle name =
voter last name, same town. Confirming a match should count the person as a
registered voter, and as AP when that voter is AP.

**Goals.** Owner-only page `/married-review`: summary per municipality, list of
candidates with Confirm / Reject. Confirm links the person to the voter so
/reports, dashboard and cards update at once. Undo is possible.

**Non-goals.** No automatic linking; no fuzzy spelling of names; no change to
voters' names; not the reverse case (census maiden, voter married).

**Approaches considered.**
1. *Picked:* saved candidate table built once by a user-run SQL script; app
   confirms one row at a time through a DB function (same writes as
   `supabase/link_new_identified_registered*.sql`).
2. Live query on page load — rejected: scans all voters, too slow for the 8s
   statement timeout.
3. Bulk SQL link of all one-candidate matches — rejected: user wants each
   checked by a person.

**Candidate rule.** NR row in `ap_match_results` (`linked_voter_id is null`,
not AP); census `LAST, FIRST… MIDDLE`, voter `LAST, FIRST… MIDDLE`;
same town, voter.first = census.first, voter.last = census.middle,
voter.last ≠ census.last; voter not deleted; voter not linked to anyone in the
census; person still NR in the census.

**Confirm** (function `asenso.married_review_decide`, service role only):
- member → `family_members.voter_id`, `is_registered = true`
- husband / wife → `families.husband_id` / `wife_id`
- `families.all_nr = false`
- `ap_match_results.linked_voter_id = voter`, match/review fields cleared;
  in Ozamiz `is_ap` = voter is_ap and not revoked, `ap_source = 'voter_is_ap'`
  when AP. Other towns keep their AP-list result.
- Old values saved on the candidate row; other pending candidates for the same
  person or the same voter become `superseded`.

**Undo** puts the old values back (same function, decision `undo`).

**Builder's calls.** Menu mark red (owner-only pages use red). Ozamiz
`families.has_ap_member` / person AP flags are updated too, like
`sync_ozamiz_ap_flags.sql`, so the dashboard agrees with /reports.
