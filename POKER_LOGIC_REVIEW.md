# Poker Logic & Stats Review

Scope: logic mistakes, poker-stats correctness, poker logic holes, and design/UX optimizations in `client/src/PokerLogger.tsx`. Architecture/testing concerns are already covered in `critique.md` / `analise_critica.md` and are not repeated here. Every finding below was verified against the code (line references) and, where marked, reproduced with a script against the actual parser/export logic.

---

## Critical — wrong numbers or silent data corruption

### C1. Export → Import round-trip silently corrupts hands (reproduced)

The export (`exportText`, `PokerLogger.tsx:1125`) writes human labels (`ACTION_LABEL`), but the import parser matches **single space-split tokens** against alias maps (`parseLine`, `:285`). Every multi-word label falls apart into tokens that either match the *wrong* alias or match `fold`/`open` first. Reproduction of a full round-trip (export a hand, re-import it):

| Logged | Export text | Re-imports as |
| --- | --- | --- |
| `call_open`, `sd_win` | `AKs CO \| Call Open \| SD WIN` | **`open`, `ns_win`** |
| `call_3bet`, `sd_loss` | `QQ BTN \| Call 3B → Check \| SD LOSS` | **`3bet`, `ns_loss`** |
| `fold_to_3bet` | `AQo HJ \| Fold 3B \| NS LOSS` | **`fold`** |
| `call_open` + `fold_to_cbet` | `JTs BB \| Call Open → Fold C-Bet` | **`open` + `cbet`** |
| `open`, `sd_win` | `KK CO \| Open → C-Bet \| SD WIN` | `open`, `cbet`, **`ns_win`** |

Mechanics of the corruption:

- `Call Open` → token `call` matches nothing, token `open` matches `open`. A passive call becomes a raise (VPIP/PFR/3-Bet% all shift).
- `Call 3B` → token `3b` matches `3bet`. Calling a 3-bet becomes making one.
- `Fold 3B` / `Fold 4B+` / `Fold Raise` / `Fold All-in` → token `fold` matches first and wins (`:337` sets `preFlopAction` once). All fold variants collapse into plain `fold`, destroying VPIP/PFR/ATS distinctions.
- `SD WIN` / `SD LOSS` → token `sd` is not an alias; token `win`/`loss` maps to **`ns_win`/`ns_loss`** (`RESULT_ALIASES`, `:263-264`). Every showdown becomes a non-showdown → WTSD/W$SD are wiped to 0 after re-import.
- `Fold C-Bet` after a call → `fold` is consumed as the *preflop* action... but preflop is already set, so it's skipped; then `C-Bet` matches flop alias `cbet`. A fold to a c-bet becomes *making* a c-bet.

No error is shown — the import preview proudly displays valid-looking hands. **This is silent corruption of the user's entire history**, and export/import is the only backup mechanism the app has (localStorage is the only store).

**Fix (pick one, ideally both):**
1. Export machine tokens instead of labels (`call_open`, `fold_to_3bet`, `sd_win`) — the parser already understands all of them, and the README already documents that format.
2. Make the parser label-aware: before the token loop, greedily match 2-token bigrams (`call open`, `fold 3b`, `sd win`, `fold c-bet`) against normalized alias keys. This also fixes hand-typed logs like `AKs CO call open sd win`.

Also: the export's own header lines (`23/07/2026, 14:30:00` and `42 mãos`) are not caught by the skip rules (`:371-372`) and show up as 2 red parse errors on every re-import of the app's own file.

### C2. `MP` position doesn't exist in the type system, the parser, or the stats tables — at the **default** table size

- `type PokerPosition` (`:9`) has no `'MP'`, but `POSITIONS_BY_COUNT` for 6/7/8-max (`:47-49`) uses `'MP'`. `npm run check` fails with 3 × `TS2322`. It ships anyway because `build` is plain `vite build` with no typecheck.
- `POSITIONS_SET` (`:234`) has no `MP` → any exported hand played from MP **fails to import** ("posição não reconhecida"). Reproduced.
- `PositionWinRate` (`:872`) and `VpipByPosition` (`:896`) iterate a hardcoded 9-max list without `MP` → every hand logged from MP is **silently invisible** in both per-position panels. The default table is 6-max, so this hits ~1/6 of all hands at default settings.

**Fix:** add `MP` to the type, the parser set, and derive the rows of both position panels from the union of positions present in the data (or from `POSITIONS_BY_COUNT`), not a hardcoded list. Then wire `npm run check` into the build so this class of bug can't ship again.

### C3. 3-Bet% denominator omits folds — the stat is inflated several-fold

```ts
const threeBetOpps = ac.callOpen + ac.threeBet + ac.foldTo4BetPlus;   // :175
const threeBetCount = ac.threeBet + ac.foldTo4BetPlus;                // :176
```

A 3-bet *opportunity* is any hand where you face an open: fold, call, or 3-bet. The formula counts only calls and 3-bets — **`fold_to_raise` (the most common response) is missing**. Real-world effect: face 100 opens, fold 90, call 5, 3-bet 5 → true 3-Bet% = 5%; the app shows 5/(5+5) = **50%**. Since live 3-Bet% targets are ~3–9%, the displayed number is unusable for its purpose.

**Fix:** `threeBetOpps = ac.foldToRaise + ac.callOpen + ac.threeBet + ac.foldTo4BetPlus` (+ arguably `ac.foldToAllin` when the all-in faced was an open-shove — see H4 on that ambiguity).

### C4. Win Rate can exceed 100% — numerator and denominator disagree on population

```ts
const wins = rc.sdWin + rc.nsWin;      // counts wins from ALL hands   :179
winRate: pct(wins, voluntary),         // divides by voluntary only    :193
```

`rc` is tallied unconditionally, so wins from **non-voluntary** hands (BB checks their option — explicitly excluded from `voluntary` by the BB-limp rule at `:109` — then wins the pot) land in the numerator but not the denominator. Checking your BB and winning is one of the most common hands in live play. Log 5 BB-check wins + 1 voluntary win from 1 voluntary hand → Win Rate = 600%.

**Fix:** count wins gated on `isVoluntary(h)` — exactly like `byPos` already does two lines up (`:161-165`). That block is correct; `winRate` just doesn't use it.

### C5. Importing the app's own export reverses chronology — and "Últ. 10/20" then reads the wrong end

Export writes **newest-first** (it iterates `hands`, which is prepend-on-save, `:1128`). Import assumes the file is **oldest-first**: line *i* gets timestamp `baseTime - (N - i) * 1000` and the array is then reversed (`:550-555`). Round-trip result: history order flips, timestamps are inverted relative to reality, and the stats scopes `last10`/`last20` (`hands.slice(0, 10)`, `:1000-1001`) silently compute over the **oldest** hands of the session instead of the most recent.

**Fix:** emit the export oldest-first (or detect the `#N` numbering direction on import and normalize).

---

## High — poker-model holes that skew stats

### H1. Showdowns that never "saw the flop": WTSD/W$SD ignore preflop all-ins and contradictory records

`wentToShowdown` requires `flopAction !== 'none'` (`:157`). Two problems:

1. **Preflop all-in showdowns** (call a shove / get your open-shove called — the bread and butter of tournament poker, especially at short stacks) have no sensible flop action, so users leave "Não foi ao flop". The hand ends `sd_win`/`sd_loss` but is excluded from both WTSD and W$SD. W$SD is precisely the stat where all-in holds/losses matter most.
2. The UI happily records the contradiction `result: sd_win` + `flopAction: 'none'`, and then treats it inconsistently: Results bars count it as a showdown, WTSD/W$SD don't.

**Fix:** derive `sawShowdown = result is sd_*` and `sawFlop = flopAction !== 'none' || sawShowdown`. That makes the contradictory state harmless and folds preflop all-ins into W$SD correctly.

### H2. The 169-hand range map misorders suited trash vs. offsuit broadways/aces

The bucket *sizes* are internally consistent (verified: all 169 hands mapped, cumulative combo counts 2.1% → 4.4% → 7.8% → 9.8% → 14.2% → 19.9% → 24.9% → 34.8% → 44.8% → 49.3% → 100% match the labels). But the *assignment* of hands to buckets is skewed: essentially **all 78 suited hands are placed in the top ~45%**, which forces mid offsuit hands out the bottom. Checked against equity-vs-random rankings:

| Hand | Equity vs random | App bucket | Reality |
| --- | --- | --- | --- |
| 32s | ~35% (bottom decile) | **top 30-35%** | ~bottom 45% |
| 42s, 52s, 63s, 84s, T4s, J3s | 37–46% | **top 30-35%** | 45–60% territory |
| A9o | ~61% | 40-45% | ~top 25-30% |
| K9o | ~59% | 40-45% | ~top 30% |
| T9o | ~54% | 40-45% | ~top 30-35% |
| 98o, 87o, T8o | 48–53% | **"Acima 60%" (trash bucket)** | ~top 35-45% |

Effect on the product: the Range Distribution panel exists to tell you "you're playing too many weak hands." Open 98o and it's reported as a bottom-half trash open; open 32s and it's reported as a top-third hand. The panel's *expected* counts stay self-consistent (they derive from the same map), but the per-hand classification — the thing a player acts on — is wrong in both directions.

**Fix:** rebucket against a published ranking (PokerStove/Equilab top-X% ordering or Sklansky-Chubukov). Suited-ness is worth roughly +2–4 percentile buckets, not "all suited hands are top-45%".

### H3. ATS excludes the small blind

`stealPositions` (`:139`) is `['BTN','CO']` (or `['BTN']` 3-handed). The standard steal definition is **CO, BTN, and SB** open-raising when folded to. SB opens are pure steals and live players' SB strategy is a classic leak area. As-is, the displayed ATS is not comparable to any reference number (25–45%).

**Fix:** add `SB` to `stealPositions` (and for 3-max, `['BTN','SB']`). Heads-up returning no steal spots is fine.

### H4. The one-action-per-hand taxonomy can't express common lines — and the fold labels straddle VPIP boundaries

Each hand stores exactly one preflop action, so multi-step sequences collapse and the user must pick which fact to keep:

- **Limp, then fold to a raise.** No `limp_fold` action. Log `limp` → the fold is lost; log `fold_to_raise` → the limp's VPIP is lost (it *was* voluntary money). Either way a stat is wrong.
- **Open, then call a 3-bet.** Logged as `call_3bet` → the open disappears from PFR (`pfrHands`, `:174`) and from ATS when it happened on BTN/CO. PFR is systematically undercounted for exactly the hands strong enough to continue.
- **Open, face 3-bet, 4-bet.** Logged `4bet_plus` → on BTN/CO the steal attempt vanishes from both ATS numerator and denominator (`STEAL_*_ACTIONS`, `:122-123`).
- **`fold_to_allin` is one bucket for two opposite situations:** (a) you had invested nothing and folded to a shove — correctly non-voluntary; (b) you *opened*, someone shoved, you folded — that's VPIP + PFR + (on steal seats) a steal attempt, but it's classed with (a) as a pure fold (`FOLD_PREFLOP_ACTIONS`, `:100`). Same for the user's judgment call between `fold_to_3bet` (VPIP) vs `fold_to_allin` (not VPIP) when the 3-bet was a shove: two labels for the same hand, wildly different stats.

**Fix options:** either split actions by "had I already put money in?" (`open_fold_allin` vs `fold_allin_cold`, add `limp_fold`, `open_call_3bet`), or store preflop as a short sequence (invested-first-action + faced-action + response) — 2 taps instead of 1 scroll-and-hunt in an 11-button grid, and every stat becomes derivable instead of inferred.

### H5. Flop actions are aggressor-only; a caller's line is inexpressible

`FlopAction` = `cbet | no_cbet | fold_to_cbet | none`. As the preflop **caller** you can fold to a c-bet — but you cannot record *calling* a c-bet (the most common way to reach showdown!) or betting when checked to (probe/stab). Users will either skip the section (see H6) or mis-tag with `no_cbet` ("Check (sem C-Bet)"), which is nonsense from a caller's seat. It doesn't corrupt the C-Bet% math (that's correctly gated on `wasAggressor`, `:144-149`), but it means flop data for calling hands is noise, and a future "fold to c-bet%" stat (a headline live-player leak) has no denominator.

**Fix:** show role-appropriate flop buttons: aggressor → C-Bet / Check; caller → Called C-Bet / Fold to C-Bet / Checked through. Same grid size, no extra taps, data becomes meaningful.

### H6. "Não foi ao flop" is the pre-selected default, and skipping it corrupts WTSD/C-Bet%

The flop step is optional with `none` pre-highlighted (`:404`, `:749-`). A user who taps result directly (the natural fast path the app itself encourages) records a flop-seeing hand as "never saw the flop": `sawFlop` undercounts → WTSD inflates; aggressor hands skip the C-Bet% denominator → C-Bet% biases toward whatever they *do* log. The auto-scroll to the flop section helps, but the result section is visible right below and nothing enforces consistency.

**Fix:** infer instead of trust — `result: sd_*` implies a flop (H1's fix); and when the flop section was untouched but the result implies postflop play, prompt once ("Viu o flop?"). Alternatively make step 05 required for non-fold hands with an explicit "não foi ao flop" tap.

### H7. `smallStackMode` is recorded but affects nothing

The SS toggle (`:409`, `:640`) is stored per hand, exported, re-imported, badged in history — and **never used in a single stat**. Push/fold-phase hands (limp ranges gone, 3-bet = shove, no c-bets) mixed into full-stack VPIP/PFR/3-Bet/C-Bet is exactly the kind of pollution the toggle presumably exists to prevent.

**Fix:** add a stats scope filter (Tudo / Só SS / Sem SS) next to the existing Tudo/Últ.20/Últ.10 selector. One-line filter on `scopedHands`.

### H8. `foldTo3Bet` is computed but never shown

`calculateStats` returns `foldTo3Bet` (`:190`) with a correct-ish formula (fold / (fold + call + 4-bet) when facing a 3-bet after opening), and it's one of the highest-value live-tell stats — but `StatsView` never renders it. Free win: add it to the Pré-Flop metric grid (or swap it in for the broken ATS until H3 lands).

---

## Medium — behavior and flow

### M1. Double-tap produces duplicate hands

The fold and fold-to-cbet auto-saves run through `setTimeout(..., 30)` (`:490`, `:501`), and "Salvar mão" has no idempotency guard. Two fast taps (very common on a phone at a live table — the app's exact use case) create two `saveHand` calls from the same closure state → duplicate hand + position advanced twice. **Fix:** guard with a `savingRef`, or make `saveHand` a reducer action that no-ops when the form is already cleared. The 30 ms timeout dance itself is a smell — pass the values explicitly instead of waiting for state to settle.

### M2. The last required tap doesn't save, unlike every other terminal action

Folds auto-save (great). `fold_to_cbet` auto-saves (great). But choosing the **result** — the actual final required field — still demands a separate "Salvar mão" tap. That's +1 tap on every played hand and an inconsistency in the interaction grammar. **Fix:** auto-save on result tap (Undo already exists as the safety net), and move Notes *above* the result buttons (or keep a post-save "add note to last hand" affordance, which the history view already provides via the note icon).

### M3. Unpaired hands cost an extra "Tipo" tap ~94% of the time

Only 6% of dealt hands are pairs; everything else needs card1 + card2 + suited/offsuit = 3 taps. Options, in increasing ambition: (a) default to offsuit (it's 3× more likely) with a one-tap toggle shown on the summary line; (b) replace the two card grids + tipo with the standard **13×13 matrix** — one tap selects hand *and* suitedness (upper triangle = suited, lower = offsuit, diagonal = pairs). On a 390 px phone each cell is ~28 px — tight but workable, and it turns the fold hot path (the majority of all hands) into 2 taps total.

### M4. Undo rewinds the dealer position even for imported hands

`undoLast` (`:509`) decrements `currentPositionIndex`, but imported hands never advanced it. Undo right after an import walks your live position backwards for no reason. Track whether the top-of-stack hand advanced the position (a boolean on the hand) and only rewind then.

### M5. Imports are stamped with the *current* session's player count

`importHands` overwrites every hand with `session.playerCount` (`:551`), and the export format doesn't carry table size at all. Re-importing a 9-max log into a 6-max session silently rewrites steal-position logic (`h.playerCount` drives `stealPositions`, `:139`) for the whole history. Include `playerCount` in the export line (e.g. `| 9max`) and parse it back.

### M6. Changing player count remaps your seat by index, not identity

`setPlayerCount` clamps the index (`:534`); since the arrays happen to share their first four entries (BB/SB/BTN/CO) the damage is limited, but e.g. HJ at 9-max (index 4) becomes MP at 6-max, and LJ/UTG+2 both collapse to UTG. Preserve by position name where possible, else nearest.

### M7. `advancePosition`'s special case is dead code with backwards names

`:205-211`: `bbIndex = positions.length - 1` — but BB is at index **0**; `length - 1` is UTG. The `if (currentIndex === sbIndex) return bbIndex` branch returns exactly what `(currentIndex + 1) % length` returns anyway. It's a no-op today, but the mislabeled indices are a trap for the next edit. (For the record: the *actual* rotation — array order BB→SB→BTN→…→UTG, advance by +1 — is correct: BB this hand means SB next hand.)

---

## Low / hygiene

- **`hand.range` is stored but never read** — stats and views all recompute `getHandRange(...)` (`:169`, `:945`, `:1190`). Drop the field, or read it (dropping is better: a stored copy goes stale when the map changes, which it just did in commit `b8e5fb6`).
- **localStorage is trusted blind** (`JSON.parse` and go, `:416-417`). A malformed or pre-migration blob (e.g. `playerCount: 10`, out-of-range `currentPositionIndex`) can produce `currentPos = undefined` and hands saved with an undefined position. Validate/clamp on load; you already version the key (`poker_session_v1`) — use it.
- **Second standing type error:** `ssMatch.index` possibly undefined (`:295`). Trivial, but it means `check` has *never* passed; wire `tsc --noEmit` into `build`/CI so C2 can't recur.
- **Google Fonts `@import` inside a component `<style>`** (`:571`) — render-blocking and re-parsed per mount; move to `index.html`. Also a live-table app benefits from real **offline PWA** treatment (manifest + service worker): poker rooms are Faraday cages, and right now a cold load with no signal shows nothing.
- **`user-scalable=no`** (`index.html:5`) — accessibility cost; iOS ignores it anyway. `maximum-scale=1` alone stops the input-zoom jump.
- **Per-position panels always render all 9 rows** even at 6-max, and in reverse action order (BB first). Render only the active table's positions, UTG→BB, and hide empty rows — less scrolling mid-session, which is the metric this app lives by.

---

## What's already right (worth keeping as-is)

- **VPIP fundamentals**: BB limp = free check excluded (`:109`); SB complete counted; `fold_to_3bet`/`fold_to_4bet_plus` counted as voluntary (money went in) — all correct and better than many hobby trackers.
- **PFR includes `fold_to_3bet`/`fold_to_4bet_plus`** — correct: the open/3-bet happened.
- **Fold-to-3-Bet% formula** (`:177`) is the right shape (fold / fold+call+4-bet).
- **Position auto-rotation** direction is correct (BB→SB→BTN→…→UTG), and per-hand `playerCount` snapshots are the right call for mixed-size sessions.
- **C-Bet% gating on preflop aggressor** (`:144-149`) is correct, including *excluding* aggressor-facing-donk-bet hands from the denominator.
- **Fold auto-save** and newest-first history are exactly right for live one-handed use.
- **Bucket combo weights** (`BUCKET_WEIGHTS`, `:78-94`) are derived from the same map they're compared against — the "exp:" baseline math is sound (6/4/12 combos per pair/suited/offsuit).

## Suggested fix order

1. **C2** (MP: type + parser + tables, wire typecheck into build) — smallest diff, unblocks everything.
2. **C1 + C5** (export machine tokens oldest-first; teach parser bigrams) — stops ongoing silent data loss.
3. **C3 + C4** (3-Bet% denominator, Win Rate population) — two one-line formula fixes.
4. **H1 + H6** (showdown implies flop) — one derived-flag change fixes WTSD, W$SD, and the contradiction.
5. **H3** (SB steals), **H8** (show Fold-to-3B), **H7** (SS filter) — small, high leverage.
6. **H2** (rebucket the range map against a published ranking).
7. **H4/H5** (taxonomy) and **M2/M3** (tap economy) — the two design investments that most advance the app's stated goal: fewer taps, truer stats.
