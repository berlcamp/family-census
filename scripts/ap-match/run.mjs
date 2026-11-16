// AP membership crossmatch for the family census.
//
//   node --env-file=.env.local scripts/ap-match/run.mjs [options]
//
//   --town "CLARIN"        only census households in this town (households.address)
//   --barangay "MIALEN"    ...and this barangay (requires --town)
//   --out results.csv      write a CSV of the results (default: no file)
//   --write                upsert into asenso.ap_match_results (default: dry run)
//   --resume <run_id>      continue a --write run that stopped; skips people
//                          that run already saved
//
// Work is done one barangay at a time and each barangay is saved before the
// next one starts, so a crash loses at most the barangay in progress.
//
// Reads (never writes) asenso.households / families / family_members /
// voters / barangay_aliases and public.existing_members. With --write it
// upserts asenso.ap_match_results and nothing else.
//
// Rules (agreed 2026-11-16):
//   * Ozamiz: voters.is_ap is the final word.
//   * Elsewhere: a person is AP when they match public.existing_members.
//   * Non-registered people are re-checked against asenso.voters; a confident
//     match flags new_identified_registered, or possible_duplicate when that
//     voter is already encoded in another family.
//   * Non-registered people found in existing_members get ap_source
//     'non_registered_ap'.
//   * "auto" needs a Matched name, same barangay, same Jr./Sr.; anything less
//     certain is "review" and is never applied without a person's decision.

import { createClient } from "@supabase/supabase-js";
import { appendFileSync, writeFileSync } from "node:fs";
import {
  barangayKey,
  classify,
  cleanCensusName,
  crossTokens,
  nameParts,
  surnameKeys,
  townKey,
} from "./nameMatch.mjs";

// ---------------------------------------------------------------------------
// Args / client
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const ONLY_TOWN = opt("--town")?.toUpperCase();
const ONLY_BRGY = opt("--barangay")?.toUpperCase();
const OUT = opt("--out");
const WRITE = args.includes("--write");
const RESUME = opt("--resume");
const RUN_ID = RESUME ?? `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
if (RESUME && !WRITE) throw new Error("--resume only makes sense with --write");

if (ONLY_BRGY && !ONLY_TOWN) throw new Error("--barangay requires --town");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (use --env-file=.env.local)");
const db = createClient(url, key, { auth: { persistSession: false } });

const OZAMIZ = "ozamiz";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------------------
// Loading (keyset-paged, read-only)
// ---------------------------------------------------------------------------

async function loadAll(schema, table, columns, filter = (q) => q, label = table) {
  const rows = [];
  let last = 0;
  for (;;) {
    let q = db.schema(schema).from(table).select(columns).gt("id", last).order("id").limit(1000);
    q = filter(q);
    let res;
    for (let attempt = 1; ; attempt++) {
      res = await q;
      if (!res.error) break;
      if (attempt >= 4) throw new Error(`${label}: ${res.error.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
    if (res.data.length === 0) break;
    rows.push(...res.data);
    last = res.data[res.data.length - 1].id;
    if (rows.length % 50000 < 1000) log(`  ${label}: ${rows.length.toLocaleString()}`);
    if (res.data.length < 1000) break;
  }
  log(`  ${label}: ${rows.length.toLocaleString()} rows`);
  return rows;
}

// ---------------------------------------------------------------------------
// Candidate index: town -> surname key -> candidates (+ barangay/first-name
// block for married-name matches)
// ---------------------------------------------------------------------------

function buildIndex(cands) {
  const byTown = new Map();
  for (const c of cands) {
    if (!c.town) continue;
    let t = byTown.get(c.town);
    if (!t) byTown.set(c.town, (t = { bySurname: new Map(), byBrgyFirst: new Map() }));
    for (const k of surnameKeys(c.parts.surname)) {
      if (!t.bySurname.has(k)) t.bySurname.set(k, []);
      t.bySurname.get(k).push(c);
    }
    if (c.brgy && c.parts.firstGiven.length >= 2) {
      const k = `${c.brgy}|${c.parts.firstGiven.slice(0, 3)}`;
      if (!t.byBrgyFirst.has(k)) t.byBrgyFirst.set(k, []);
      t.byBrgyFirst.get(k).push(c);
    }
  }
  return byTown;
}

function candidatesFor(index, town, brgy, parts) {
  const t = index.get(town);
  if (!t) return [];
  const seen = new Set();
  const out = [];
  const add = (list) => {
    for (const c of list ?? []) if (!seen.has(c.id)) (seen.add(c.id), out.push(c));
  };
  for (const k of surnameKeys(parts.surname)) add(t.bySurname.get(k));
  if (brgy && parts.firstGiven.length >= 2) add(t.byBrgyFirst.get(`${brgy}|${parts.firstGiven.slice(0, 3)}`));
  return out;
}

// Best candidate, ranked like adm-v26 crossmatchName (tier, then score, then
// same barangay). A tie between two different people is never auto.
function bestMatch(index, town, brgy, name) {
  const parts = nameParts(name);
  const tierRank = { auto: 3, review: 2, none: 0 };
  let best = null;
  let second = null;
  for (const c of candidatesFor(index, town, brgy, parts)) {
    const sameBarangay = !!brgy && c.brgy === brgy;
    const r = classify(name, c.name, { sameBarangay });
    if (r.status === "none") continue;
    const rank = tierRank[r.status] * 10 + r.score + (sameBarangay ? 0.05 : 0);
    const e = { c, ...r, rank };
    if (!best || rank > best.rank) (second = best, (best = e));
    else if (!second || rank > second.rank) second = e;
  }
  if (!best) return { status: "none", c: null, reason: "" };
  if (
    best.status === "auto" && second && second.status === "auto" &&
    Math.abs(second.rank - best.rank) < 1e-9 &&
    // The same name twice in one list is a duplicate entry, not two people.
    crossTokens(second.c.name).join(" ") !== crossTokens(best.c.name).join(" ")
  ) {
    return { ...best, status: "review", reason: `Two equal matches (also ${second.c.name}, ${second.c.rawBrgy ?? ""})` };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`AP crossmatch ${WRITE ? "(WRITE)" : "(dry run)"} ${ONLY_TOWN ?? "all towns"}${ONLY_BRGY ? " / " + ONLY_BRGY : ""}`);

  // Aliases
  const { data: aliases, error: aErr } = await db.schema("asenso").from("barangay_aliases")
    .select("source, town_key, barangay_key, official_barangay");
  if (aErr) throw new Error(`barangay_aliases: ${aErr.message}`);
  const alias = new Map(aliases.map((a) => [`${a.source}|${a.town_key}|${a.barangay_key}`, a.official_barangay]));
  const officialBrgy = (source, town, brgy) =>
    barangayKey(alias.get(`${source}|${townKey(town)}|${barangayKey(brgy)}`) ?? brgy);

  // Census
  log("Loading census…");
  const households = await loadAll("asenso", "households", "id, address, barangay",
    (q) => (ONLY_TOWN ? q.eq("address", ONLY_TOWN) : q).match(ONLY_BRGY ? { barangay: ONLY_BRGY } : {}));
  const hh = new Map(households.map((h) => [h.id, h]));
  const allFamilies = await loadAll("asenso", "families", "id, household_id, husband_id, wife_id, husband_name, wife_name");
  const allMembers = await loadAll("asenso", "family_members", "id, family_id, voter_id, fullname");

  // Voter ids already encoded anywhere in the census (whole census, not just
  // this town — a duplicate may sit in another barangay).
  const inCensus = new Set();
  for (const f of allFamilies) (f.husband_id && inCensus.add(f.husband_id), f.wife_id && inCensus.add(f.wife_id));
  for (const m of allMembers) if (m.voter_id) inCensus.add(m.voter_id);

  const families = allFamilies.filter((f) => hh.has(f.household_id));
  const fam = new Map(families.map((f) => [f.id, f]));
  const members = allMembers.filter((m) => fam.has(m.family_id));

  // People to match
  const people = [];
  const pushPerson = (person_type, person_id, raw, linked, h) =>
    raw && raw.trim() && people.push({ person_type, person_id, raw, linked_voter_id: linked ?? null, h });
  for (const f of families) {
    const h = hh.get(f.household_id);
    pushPerson("husband", f.id, f.husband_name, f.husband_id, h);
    pushPerson("wife", f.id, f.wife_name, f.wife_id, h);
  }
  for (const m of members) pushPerson("member", m.id, m.fullname, m.voter_id, hh.get(fam.get(m.family_id).household_id));
  log(`People to match: ${people.length.toLocaleString()}`);

  // Voters
  log("Loading voters…");
  const townsNeeded = new Set(people.map((p) => townKey(p.h.address)));
  const voterRows = await loadAll("asenso", "voters", "id, fullname, barangay, address, is_ap, ap_revoked, deleted_at",
    (q) => (ONLY_TOWN ? q.eq("address", ONLY_TOWN) : q));
  const voterById = new Map(voterRows.map((v) => [v.id, v]));
  // Linked voters registered in another town (filtered runs only).
  const missingLinked = [...new Set(people.map((p) => p.linked_voter_id).filter((id) => id && !voterById.has(id)))];
  for (let i = 0; i < missingLinked.length; i += 500) {
    const { data, error } = await db.schema("asenso").from("voters")
      .select("id, fullname, barangay, address, is_ap, ap_revoked, deleted_at").in("id", missingLinked.slice(i, i + 500));
    if (error) throw new Error(`voters (linked): ${error.message}`);
    for (const v of data) voterById.set(v.id, v);
  }
  const voterCands = voterRows
    .filter((v) => !v.deleted_at && v.fullname && townsNeeded.has(townKey(v.address)))
    .map((v) => ({
      id: v.id, name: v.fullname, town: townKey(v.address), brgy: barangayKey(v.barangay), rawBrgy: v.barangay,
      parts: nameParts(v.fullname), v,
    }));
  const voterIndex = buildIndex(voterCands);

  // Existing members (outside Ozamiz only)
  log("Loading existing members…");
  const emRows = await loadAll("public", "existing_members", "id, lastname, firstname, middlename, fullname, barangay, municipality, ap_revoked");
  const emCands = [];
  for (const e of emRows) {
    const town = townKey(e.municipality);
    if (!town || town === OZAMIZ || !townsNeeded.has(town)) continue;
    const name = (e.lastname || e.firstname)
      ? `${(e.lastname ?? "").trim()}, ${[e.firstname, e.middlename].filter(Boolean).join(" ").trim()}`
      : (e.fullname ?? "").trim();
    if (!name || !crossTokens(name).length) continue;
    emCands.push({
      id: e.id, name, town, brgy: officialBrgy("existing_members", e.municipality, e.barangay), rawBrgy: e.barangay,
      parts: nameParts(name), e,
    });
  }
  const emIndex = buildIndex(emCands);
  log(`Candidates: ${voterCands.length.toLocaleString()} voters, ${emCands.length.toLocaleString()} existing members`);

  // Resume: skip people this run already saved.
  let todo = people;
  if (RESUME) {
    const done = new Set();
    for (const r of await loadAll("asenso", "ap_match_results", "id, person_type, person_id",
      (q) => q.eq("run_id", RUN_ID), "already saved")) done.add(`${r.person_type}|${r.person_id}`);
    todo = people.filter((p) => !done.has(`${p.person_type}|${p.person_id}`));
    log(`Resuming ${RUN_ID}: ${done.size.toLocaleString()} already saved, ${todo.length.toLocaleString()} to go`);
  }

  // Batches: one barangay at a time, each saved before the next starts.
  const groups = new Map();
  for (const p of todo) {
    const k = `${(p.h.address ?? "").trim().toUpperCase()} / ${(p.h.barangay ?? "").trim().toUpperCase()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const batches = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  log(`Matching ${todo.length.toLocaleString()} people in ${batches.length} barangay batches (run_id ${RUN_ID})`);

  const matchPerson = (p) => {
    const name = cleanCensusName(p.raw);
    const town = townKey(p.h.address);
    const brgy = officialBrgy("households", p.h.address, p.h.barangay);
    const r = {
      person_type: p.person_type, person_id: p.person_id, fullname: p.raw, linked_voter_id: p.linked_voter_id,
      town: p.h.address, barangay: p.h.barangay,
      matched_voter_id: null, voter_match_status: null, voter_match_reason: null, voter_in_census_elsewhere: null,
      existing_member_id: null, em_match_status: null, em_match_reason: null,
      ap_source: null, is_ap: null, new_identified_registered: null, possible_duplicate: null,
      run_id: RUN_ID,
      // CSV-only columns (not stored)
      _name_used: name, _voter_name: "", _voter_brgy: "", _em_name: "", _em_brgy: "",
    };

    // The registered voter behind this person (linked, or found by re-check).
    let voter = p.linked_voter_id ? voterById.get(p.linked_voter_id) ?? null : null;

    if (!p.linked_voter_id) {
      const m = bestMatch(voterIndex, town, brgy, name);
      r.voter_match_status = m.status;
      r.voter_match_reason = m.reason || null;
      if (m.c) {
        r.matched_voter_id = m.c.id;
        r.voter_in_census_elsewhere = inCensus.has(m.c.id);
        r._voter_name = m.c.name;
        r._voter_brgy = m.c.rawBrgy ?? "";
      }
      if (m.status === "auto") {
        r.possible_duplicate = r.voter_in_census_elsewhere;
        r.new_identified_registered = !r.voter_in_census_elsewhere;
        voter = m.c.v;
      } else {
        r.new_identified_registered = m.status === "none" ? false : null;
        r.possible_duplicate = m.status === "none" ? false : null;
      }
    }

    if (voter && townKey(voter.address) === OZAMIZ) {
      // Ozamiz: voters.is_ap decides.
      r.is_ap = voter.is_ap === true && voter.ap_revoked !== true;
      r.ap_source = r.is_ap ? "voter_is_ap" : null;
    } else if (!voter && town === OZAMIZ) {
      // Ozamiz non-registered with no confident voter match: not AP (pending
      // review when the voter re-check is 'review').
      r.is_ap = r.voter_match_status === "review" ? null : false;
    } else {
      // Outside Ozamiz: look up the AP member list.
      const emName = voter ? voter.fullname : name;
      const emTown = voter ? townKey(voter.address) : town;
      const emBrgy = voter ? barangayKey(voter.barangay) : brgy;
      const m = bestMatch(emIndex, emTown, emBrgy, emName);
      r.em_match_status = m.status;
      r.em_match_reason = m.reason || null;
      if (m.c) {
        r.existing_member_id = m.c.id;
        r._em_name = m.c.name;
        r._em_brgy = m.c.rawBrgy ?? "";
      }
      if (m.status === "auto" && m.c.e.ap_revoked) {
        r.em_match_reason = "AP revoked";
        r.is_ap = false;
      } else if (m.status === "auto") {
        r.is_ap = true;
        r.ap_source = voter ? "existing_member" : "non_registered_ap";
      } else {
        r.is_ap = m.status === "review" ? null : false;
      }
    }
    return r;
  };

  const counters = {
    people: 0, linked: 0, non_registered: 0,
    "is_ap = true": 0, "  via voter_is_ap (Ozamiz)": 0, "  via existing_member": 0, "  via non_registered_ap": 0,
    "is_ap pending review": 0, new_identified_registered: 0, possible_duplicate: 0,
    "voter re-check: review": 0, "AP list: review": 0,
  };
  const tally = (r) => {
    counters.people++;
    counters[r.linked_voter_id != null ? "linked" : "non_registered"]++;
    if (r.is_ap === true) counters["is_ap = true"]++;
    if (r.ap_source === "voter_is_ap") counters["  via voter_is_ap (Ozamiz)"]++;
    if (r.ap_source === "existing_member") counters["  via existing_member"]++;
    if (r.ap_source === "non_registered_ap") counters["  via non_registered_ap"]++;
    if (r.is_ap === null) counters["is_ap pending review"]++;
    if (r.new_identified_registered === true) counters.new_identified_registered++;
    if (r.possible_duplicate === true) counters.possible_duplicate++;
    if (r.voter_match_status === "review") counters["voter re-check: review"]++;
    if (r.em_match_status === "review") counters["AP list: review"]++;
  };

  const csvCols = ["person_type", "person_id", "town", "barangay", "fullname", "_name_used", "linked_voter_id",
    "voter_match_status", "_voter_name", "_voter_brgy", "voter_match_reason", "voter_in_census_elsewhere",
    "new_identified_registered", "possible_duplicate",
    "em_match_status", "_em_name", "_em_brgy", "em_match_reason", "ap_source", "is_ap"];
  const esc = (v) => (v == null ? "" : /[",\n\t]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  if (OUT && !RESUME) writeFileSync(OUT, csvCols.join(",") + "\n");

  // review_decision / reviewed_by / reviewed_at are never sent, so a re-run
  // keeps decisions people have already made.
  const save = async (results) => {
    const rows = results.map(({ _name_used, _voter_name, _voter_brgy, _em_name, _em_brgy, ...rest }) => ({
      ...rest,
      matched_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      for (let attempt = 1; ; attempt++) {
        const { error } = await db.schema("asenso").from("ap_match_results")
          .upsert(rows.slice(i, i + 500), { onConflict: "person_type,person_id" });
        if (!error) break;
        if (attempt >= 4) throw new Error(`ap_match_results upsert: ${error.message} (resume with --resume ${RUN_ID})`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  };

  const t0 = Date.now();
  let doneCount = 0;
  for (const [bi, [label, group]] of batches.entries()) {
    const tb = Date.now();
    const results = group.map(matchPerson);
    if (WRITE) await save(results);
    if (OUT) appendFileSync(OUT, results.map((r) => csvCols.map((c) => esc(r[c])).join(",")).join("\n") + "\n");
    results.forEach(tally);
    doneCount += group.length;
    const elapsed = (Date.now() - t0) / 1000;
    const eta = Math.round((elapsed / doneCount) * (todo.length - doneCount) / 60);
    log(`[${bi + 1}/${batches.length}] ${label}: ${group.length.toLocaleString()} people, ` +
      `${results.filter((r) => r.is_ap === true).length.toLocaleString()} AP, ` +
      `${results.filter((r) => r.new_identified_registered === true).length} new registered ` +
      `(${Math.round((Date.now() - tb) / 1000)}s) · ${doneCount.toLocaleString()}/${todo.length.toLocaleString()}, ~${eta} min left` +
      (WRITE ? " · saved" : ""));
  }

  console.table(counters);
  if (OUT) log(`Wrote ${OUT}`);
  log(WRITE ? `Done (run_id ${RUN_ID})` : "Dry run: nothing written to the database.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
