// Name comparison for the AP crossmatch.
//
// The core rules (tokenScore, coveredIndexes, compareForCrossmatch, barangayKey)
// are a plain-JS copy of adm-v26 lib/utils/voterMatch.ts at commit 600769e
// (2026-10-01), the matcher behind /bulk-category-finder. Keep them in step if
// that file changes. The only change to compareForCrossmatch is that it also
// returns the input words it could not find (`inputMissing`), which the
// census-specific safeguards in classify() below need.

export const SURNAME_GATE = 0.8;
export const GIVEN_GATE = 0.7;
const POSSIBLE_MIN_SCORE = 0.7;
const FIRST_NAME_TYPO_GATE = 0.6;
const JOINED_WORD_GATE = 0.85;
const MARRIED_FIRST_NAME_GATE = 0.75;

export const LOW_WEIGHT_TOKENS = new Set([
  "jr", "sr", "ii", "iii", "iv", "v", "vi",
  "dela", "de", "del", "la", "los", "san", "santa",
]);
// "V"/"VI" are left out: in these lists a lone V is almost always a middle
// initial ("DANILO V."), not "the Fifth".
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

// ---------------------------------------------------------------------------
// Copied from adm-v26 voterMatch.ts
// ---------------------------------------------------------------------------

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value) {
  const map = new Map();
  const cleaned = value.replace(/\s+/g, "");
  for (let i = 0; i < cleaned.length - 1; i++) {
    const gram = cleaned.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  let intersection = 0;
  let aTotal = 0;
  for (const count of aGrams.values()) aTotal += count;
  let bTotal = 0;
  for (const count of bGrams.values()) bTotal += count;
  for (const [gram, count] of aGrams) {
    const other = bGrams.get(gram);
    if (other) intersection += Math.min(count, other);
  }
  return (2 * intersection) / (aTotal + bTotal);
}

function damerauOsaDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

export function editSimilarity(a, b) {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  return 1 - damerauOsaDistance(a, b) / len;
}

function tokenWeight(token) {
  if (LOW_WEIGHT_TOKENS.has(token)) return 0.3;
  if (token.length === 1) return 0.3;
  return token.length;
}

export function tokenScore(a, b) {
  if (a === b) return 1;
  if (a.length === 1 && b.startsWith(a)) return 0.9;
  if (b.length === 1 && a.startsWith(b)) return 0.9;
  if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) >= 2) {
    return 0.85;
  }
  return Math.max(similarity(a, b), editSimilarity(a, b));
}

function scoreTokens(inputTokens, candTokens) {
  if (inputTokens.length === 0 || candTokens.length === 0) return 0;
  const direction = (from, to) => {
    let num = 0;
    let den = 0;
    for (const t of from) {
      let best = 0;
      for (const o of to) best = Math.max(best, tokenScore(t, o));
      const w = tokenWeight(t);
      num += w * best;
      den += w;
    }
    return den === 0 ? 0 : num / den;
  };
  const recall = direction(inputTokens, candTokens);
  const precision = direction(candTokens, inputTokens);
  if (recall + precision === 0) return 0;
  return (2 * recall * precision) / (recall + precision);
}

export function tokenize(value) {
  return normalize(value)
    .split(" ")
    .filter((t) => t.length >= 1);
}

export function isSignificantToken(token) {
  return token.length >= 2 && !LOW_WEIGHT_TOKENS.has(token);
}

function bestTokenScore(token, candidates) {
  let best = 0;
  for (const c of candidates) best = Math.max(best, tokenScore(token, c));
  return best;
}

// "DOÑA CONSUELO" = "DONA CONSUELO", "STA" = "SANTA", "(...)" dropped, etc.
// Same rules as SQL asenso.brgy_key().
export function barangayKey(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\bSTA\b\.?/g, "SANTA")
    .replace(/\bSTO\b\.?/g, "SANTO")
    .replace(/\bPROPER\b/g, "P")
    .replace(/\bCENTRAL\b/g, "C")
    .replace(/[^A-Z0-9]/g, "");
}

export function crossTokens(value) {
  return tokenize(value.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

function joinedScore(a, b) {
  if (a === b) return 1;
  const sim = editSimilarity(a, b);
  return sim >= JOINED_WORD_GATE ? sim : 0;
}

function bestJoinedScore(token, pool) {
  let best = bestTokenScore(token, pool);
  for (let i = 0; i + 1 < pool.length && best < 1; i++) {
    best = Math.max(best, joinedScore(token, pool[i] + pool[i + 1]));
  }
  return best;
}

function coveredIndexes(from, to, gate) {
  const covered = new Set();
  for (let i = 0; i < from.length; i++) {
    if (bestJoinedScore(from[i], to) >= gate) covered.add(i);
  }
  for (let i = 0; i + 1 < from.length; i++) {
    const joined = from[i] + from[i + 1];
    if (to.some((t) => joinedScore(joined, t) >= gate)) {
      covered.add(i);
      covered.add(i + 1);
    }
  }
  return covered;
}

function usedCandidateIndexes(inputWords, cand) {
  const used = new Set();
  for (const w of inputWords) {
    let bestIdx = -1;
    let best = 0;
    cand.forEach((c, i) => {
      const sc = tokenScore(w, c);
      if (sc > best) {
        best = sc;
        bestIdx = i;
      }
    });
    let pairIdx = -1;
    for (let i = 0; i + 1 < cand.length; i++) {
      const sc = joinedScore(w, cand[i] + cand[i + 1]);
      if (sc > best) {
        best = sc;
        pairIdx = i;
      }
    }
    if (best < GIVEN_GATE) continue;
    if (pairIdx !== -1) {
      used.add(pairIdx);
      used.add(pairIdx + 1);
    } else if (bestIdx !== -1) {
      used.add(bestIdx);
    }
  }
  for (let i = 0; i + 1 < inputWords.length; i++) {
    const joined = inputWords[i] + inputWords[i + 1];
    cand.forEach((c, j) => {
      if (joinedScore(joined, c) >= GIVEN_GATE) used.add(j);
    });
  }
  return used;
}

// tier: "Matched" | "Possible match" | "Not found"
export function compareForCrossmatch(inputName, voterFullname, barangayOk = true) {
  const input = crossTokens(inputName);
  const candAll = crossTokens(voterFullname);
  const comma = voterFullname.indexOf(",");
  const candSurname = comma === -1 ? [] : crossTokens(voterFullname.slice(0, comma));
  const candGiven = comma === -1 ? candAll : crossTokens(voterFullname.slice(comma + 1));
  const score = scoreTokens(input, candAll);
  const none = { tier: "Not found", score, reason: "", inputMissing: [] };
  if (input.length === 0 || candAll.length === 0) return none;

  if (input.join(" ") === candAll.join(" ")) {
    return { tier: "Matched", score: 1, reason: "", inputMissing: [] };
  }

  const inputSig = input.filter(isSignificantToken);
  const inputInitials = input.filter((t) => t.length === 1 && !LOW_WEIGHT_TOKENS.has(t));

  const inCovered = coveredIndexes(inputSig, candAll, GIVEN_GATE);
  const inputMissing = inputSig.filter((_, i) => !inCovered.has(i));

  const used = usedCandidateIndexes(inputSig, candAll);
  const leftover = candAll.filter((t, i) => !used.has(i) && t.length >= 2);

  const initialsOk = inputInitials.every((ini) => leftover.some((t) => t.startsWith(ini)));
  const leftoverAfterInitials = leftover.filter(
    (t) => isSignificantToken(t) && !inputInitials.some((ini) => t.startsWith(ini)),
  );

  const words = input.filter((t) => t.length >= 2);

  const candSurnameSig = candSurname.filter(isSignificantToken);
  const surnameCoveredOk =
    candSurnameSig.length === 0 ||
    candSurnameSig.every((t) => bestJoinedScore(t, words) >= SURNAME_GATE) ||
    bestJoinedScore(candSurname.join(""), words) >= SURNAME_GATE;

  const firstGiven = candGiven.find(isSignificantToken);
  const firstGivenScore = firstGiven ? bestJoinedScore(firstGiven, words) : 1;
  const firstGivenOk = firstGivenScore >= GIVEN_GATE;

  if (inputMissing.length === 0 && surnameCoveredOk && firstGivenOk && initialsOk) {
    return { tier: "Matched", score, reason: "", inputMissing };
  }

  const agree = inputSig.length - inputMissing.length;
  if (agree < 2 || inputMissing.length > 1 || score < POSSIBLE_MIN_SCORE) return { ...none, inputMissing };
  if (leftoverAfterInitials.length > 1) return { ...none, inputMissing };

  if (!firstGivenOk) {
    const typo =
      firstGiven !== undefined &&
      inputMissing.some((t) => tokenScore(t, firstGiven) >= FIRST_NAME_TYPO_GATE);
    if (!typo) return { ...none, inputMissing };
    return { tier: "Possible match", score, reason: "First name spelled differently", inputMissing };
  }
  if (!surnameCoveredOk) {
    if (firstGivenScore < MARRIED_FIRST_NAME_GATE || !barangayOk) return { ...none, inputMissing };
    return { tier: "Possible match", score, reason: "Different surname (married name or typo?)", inputMissing };
  }
  if (!initialsOk) {
    return { tier: "Possible match", score, reason: "Middle initial does not match", inputMissing };
  }
  return {
    tier: "Possible match",
    score,
    reason: `Name part not in record (${inputMissing.join(" ").toUpperCase()})`,
    inputMissing,
  };
}

// ---------------------------------------------------------------------------
// Census-specific helpers
// ---------------------------------------------------------------------------

// Words that encoders typed into the name field but are not part of the name.
const JUNK_TAIL = new Set(["son", "daughter", "dau", "grandson", "granddaughter", "wife", "husband"]);

// Census names come as "SURNAME, GIVEN MIDDLE", "SURNAME\tGIVEN\tMIDDLE" or
// "SURNAME GIVEN MIDDLE". Return "SURNAME, GIVEN MIDDLE" with junk dropped.
export function cleanCensusName(raw) {
  let s = (raw ?? "").replace(/\s+$/g, "").replace(/^\s+/g, "");
  if (!s) return "";
  if (!s.includes(",")) {
    if (s.includes("\t")) {
      const [sur, ...rest] = s.split("\t");
      s = `${sur.trim()}, ${rest.join(" ")}`;
    } else {
      s = s.replace(/^(\S+)\s+/, "$1, ");
    }
  }
  // "TAMPO-OG" -> "TAMPOOG": a hyphenated name is one word.
  s = s.replace(/(\p{L})-(\p{L})/gu, "$1$2");
  s = s.replace(/[\t_]+/g, " ").replace(/\s+-\s*$/g, "").replace(/\s+/g, " ").trim();
  const words = s.split(" ");
  while (words.length > 2 && JUNK_TAIL.has(words[words.length - 1].toLowerCase().replace(/[^a-z]/g, ""))) {
    words.pop();
  }
  return words.join(" ");
}

// Significant surname tokens and given tokens of a "SURNAME, GIVEN" name.
export function nameParts(name) {
  const comma = name.indexOf(",");
  const surname = comma === -1 ? crossTokens(name).slice(0, 1) : crossTokens(name.slice(0, comma));
  const given = comma === -1 ? crossTokens(name).slice(1) : crossTokens(name.slice(comma + 1));
  const givenSig = given.filter((t) => !LOW_WEIGHT_TOKENS.has(t));
  return {
    surname,
    given,
    firstGiven: givenSig[0] ?? "",
    // Last given word when there are 2+ (the middle name, or its initial).
    middle: givenSig.length >= 2 ? givenSig[givenSig.length - 1] : "",
    suffix: crossTokens(name).filter((t) => SUFFIXES.has(t)).sort().join(","),
  };
}

// Blocking keys: a candidate is only compared with names sharing one of these.
export function surnameKeys(surnameTokens) {
  const all = surnameTokens.join("");
  const sig = surnameTokens.filter((t) => !LOW_WEIGHT_TOKENS.has(t)).join("");
  const keys = new Set();
  if (all.length >= 2) keys.add(all.slice(0, 3));
  if (sig.length >= 2) keys.add(sig.slice(0, 3));
  return [...keys];
}

// "City of Ozamiz" = "OZAMIZ CITY" -> "ozamiz". Same rules as SQL asenso.town_key().
export function townKey(value) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\b(city|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Final verdict for one census name against one candidate.
//   status: "auto" | "review" | "none"
export function classify(inputName, candName, { sameBarangay }) {
  const cmp = compareForCrossmatch(inputName, candName, sameBarangay);
  if (cmp.tier === "Not found") return { status: "none", score: cmp.score, reason: "" };

  const a = nameParts(inputName);
  const b = nameParts(candName);

  // Safeguard 1: a different middle name is a different person (child vs parent
  // with the same first name), unless the comparator already accounted for it.
  // The candidate's middle may match any later given word ("LILY DELOS POBRES"
  // vs "LILY D.").
  const inputTailInitials = a.given
    .filter((t) => !SUFFIXES.has(t))
    .slice(1)
    .map((t) => t[0]);
  if (
    a.middle && b.middle &&
    !inputTailInitials.includes(b.middle[0]) &&
    cmp.inputMissing.includes(a.middle)
  ) {
    return { status: "none", score: cmp.score, reason: "Different middle name" };
  }

  if (cmp.tier === "Possible match") {
    return { status: "review", score: cmp.score, reason: cmp.reason };
  }

  // Matched: auto only when nothing else is in doubt.
  const notes = [];
  // Safeguard 4: the first names must correspond. Without this a single initial
  // in the record can stand in for several census words ("RICA JANE RAMIENTOS"
  // vs "JANETH R.").
  if (!firstNamesAgree(a, b)) notes.push("First names differ");
  // Safeguard 2: Jr./Sr. difference (father vs son).
  if (a.suffix !== b.suffix) notes.push(`Suffix differs (${a.suffix || "none"} vs ${b.suffix || "none"})`);
  // Safeguard 3: must be the same barangay.
  if (!sameBarangay) notes.push("Different barangay");
  if (notes.length) return { status: "review", score: cmp.score, reason: notes.join("; ") };
  return { status: "auto", score: cmp.score, reason: cmp.score === 1 ? "Exact" : "Matched" };
}

function firstNamesAgree(a, b) {
  const fa = a.firstGiven;
  const fb = b.firstGiven;
  if (!fa || !fb) return false;
  if (fa.length === 1 || fb.length === 1) return false;
  if (tokenScore(fa, fb) >= GIVEN_GATE) return true;
  // Split / joined first names: "MARK LOU" = "MARKLOU", "RAY MARK" = "RAYMARK".
  const ga = a.given.filter((t) => !LOW_WEIGHT_TOKENS.has(t));
  const gb = b.given.filter((t) => !LOW_WEIGHT_TOKENS.has(t));
  if (ga.length >= 2 && editSimilarity(ga[0] + ga[1], fb) >= JOINED_WORD_GATE) return true;
  if (gb.length >= 2 && editSimilarity(fa, gb[0] + gb[1]) >= JOINED_WORD_GATE) return true;
  return false;
}
