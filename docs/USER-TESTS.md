# Trader test: PairPilot vs two manual orders

**Question.** Does PairPilot make a long/short pair that did not finish as planned easier to understand and resolve than doing it with two orders in the dreamDEX app? If traders find the manual way just as easy, a polished dashboard is not an advantage.

**Status: not run yet.** There are no trader results. Record each session below as it happens; never fill in results that did not happen.

## Who

Three people who already trade perps and have opened long/short pairs before. Note each person's experience level, not their name, unless they agree to be named.

## Setup (per person, about 30 minutes)

- Somnia Tokyo testnet, paper USDso, the smallest size: 50 USDso total. Say up front that nothing here is real money and that we are testing the tool, not them.
- Same pair in both conditions, e.g. HYPE/SOL. Alternate which condition goes first (person 1: manual first, person 2: PairPilot first, person 3: manual first).
- Screen-share or sit beside them. Do not explain the UI. If they ask, answer with "what would you try?" and note the question.

## Tasks

**Task A · Open a pair.** "Go long HYPE and short SOL, about 25 USDso each."
- Manual: two orders in the dreamDEX app.
- PairPilot: the dashboard (Linked wallet) or Simulation if they have no linked wallet.

**Task B · Understand a broken pair.** Show them an account where only ONE leg filled.
- PairPilot: Simulation, scenario "Second signature rejected" (labeled simulation); or a real one-legged position staged on a test owner with `npm run trade -- open --owner=… --inject=withhold-second-leg` (labeled injected fault).
- Manual: the same staged real position, viewed in the dreamDEX app.
- Ask: "What is your exposure right now?" and "What would you do next?" Do not hint.

**Task C · Resolve it.** "Get back to flat, or to a position you are comfortable keeping." Let them choose.

## What to record

| Measure | How |
| --- | --- |
| Time to correct state | Seconds from first look until they correctly state both legs' open quantities |
| Correct next action | Did they pick a safe next step (close the open leg, or keep it deliberately)? Any attempt to resend or double the leg counts as an error |
| Actions | Clicks/signatures to finish Task C |
| Residual left | Open quantity after Task C, per leg |
| Confidence | "How sure are you of your position now?" 1–5 |
| Preference | "Which would you use for your next pair, and why?" Quote verbatim |
| Confusion | Every question they asked, and where they hesitated |

## Session log

Add one row per session as it happens. "What changed" is the change we made to PairPilot because of it (or "none").

| Date | Role / experience | Condition order | What they said (verbatim where possible) | Measures (A/B/C) | What changed |
| --- | --- | --- | --- | --- | --- |

## Reading the results

- PairPilot helps if, in Task B and C, people state the open exposure faster and more correctly, make fewer unsafe moves, and say they would use it again for a reason other than looks.
- If manual is as good, say so in the submission and narrow the claim. Do not tune the protocol after the fact to get a better answer.
- Fix only the blockers people actually hit, and log each fix against the session that found it.
