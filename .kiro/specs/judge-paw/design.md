# Design — Judge Paw

## Overview

Judge Paw is a single-page web app: a couple enters a dispute topic and each partner's
statement, and an AI judge ("Judge Paw") renders a fair, warm verdict — a Ruling, the
Reasoning, and a Sentence (make-up action). This document is the technical design that
the implementation tasks are generated from. The existing Claude-built standalone is the
**visual reference**; this design rebuilds it as a clean, reviewable codebase.

## Goals

- Faithfully match the existing Judge Paws visual design (relationship-court theme).
- Keep the Anthropic API key server-side; never ship it to the browser.
- Make the verdict engine the heart of the app — fair, balanced, in-persona.
- Ship a clean repo that demonstrates Kiro spec-driven development.

## Architecture

```
┌─────────────┐     POST /api/verdict      ┌──────────────────┐
│  React SPA  │ ──────────────────────────►│ Serverless func  │
│  (Vite)     │   { topic, partnerA,       │ (Vercel/CF)      │
│             │     partnerB }             │  holds API key   │
│  Court UI   │ ◄──────────────────────────│  calls Claude    │
└─────────────┘   { ruling, reasoning,     └────────┬─────────┘
                    sentence }                       │
                                                     ▼
                                            Anthropic Claude API
                                          (structured verdict output)
```

- **Frontend:** React + Vite + TypeScript. Single screen with a small client-side state
  machine: `intake → deliberating → verdict`.
- **Backend:** One serverless function (`/api/verdict`). Holds `ANTHROPIC_API_KEY`,
  validates input, calls Claude, returns a typed verdict.
- **Brain:** Claude (`claude-sonnet-4-6` default) using tool-use / structured output so
  the verdict always returns the same shape.

## Frontend components

| Component | Responsibility |
|-----------|----------------|
| `App` | Owns the `intake → deliberating → verdict` state machine |
| `CaseIntake` | Topic field + Partner A / Partner B statement inputs + validation |
| `Deliberating` | Judge Paw "thinking" animation while the request is in flight |
| `VerdictCard` | Renders Ruling / Reasoning / Sentence with the gavel + persona |
| `NewCaseButton` | Resets state back to `intake` |

## Data models

```ts
type CaseInput = {
  topic: string;
  partnerA: { name?: string; statement: string };
  partnerB: { name?: string; statement: string };
};

type Verdict = {
  ruling: string;       // who, and to what degree — never a flat "A is right"
  reasoning: string;    // MUST reference a valid point from BOTH partners
  sentence: string;     // a small, concrete, kind make-up action
  safety?: "declined";  // present when the case was unsafe to judge
};
```

## Verdict engine

The serverless function calls Claude with a system prompt that pins the persona and the
fairness contract, and a tool schema that forces the `Verdict` shape.

**Persona contract (system prompt):**
- Warm, fair, lightly playful — a beloved animal judge, never cruel or dismissive.
- MUST acknowledge at least one valid point from each partner in `reasoning`.
- Rulings are nuanced (proportional fault), not binary win/lose.
- `sentence` is always a small kind action (e.g., "Partner A makes the coffee tomorrow").

**Safety gate:** if either statement describes abuse, threats, or harm, return
`safety: "declined"` and a gentle message instead of a verdict (Requirement 2.3).

**Structured output:** define a `render_verdict` tool whose input schema is the `Verdict`
type; force `tool_choice` to it so parsing is never needed.

## Error handling

- Empty statement → client blocks submit, inline prompt (Requirement 1.2).
- API/network failure → friendly retry state, no raw error shown.
- Model returns malformed output → schema validation retries once, then graceful error.

## Testing

- Unit: input validation, state-machine transitions.
- Verdict contract: golden tests asserting reasoning references both sides; safety gate
  trips on an abusive sample.
- Manual: visual match against the existing Judge Paws design.

## Open questions (confirm against the live app)

- Is there a judge-selection screen, case history, or a shareable verdict card? If yes,
  add components + a requirement each.
