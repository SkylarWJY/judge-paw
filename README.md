# ⚖️🐾 Judge Paw

> An AI judge that hears both sides of a couple's argument and delivers a playful — but fair — verdict.

Built **From Board to Build** for the **Miro × Kiro LA Hackathon**: planned in Miro, shipped with Kiro.

---

## The problem

Every couple has the same unsolved workflow: *"who's actually right here?"* — settled today by sulking, guessing, or asking a group chat. There is no neutral third party. The dispute stalls, nobody feels heard, and the same fight repeats next week.

**Judge Paw** is that neutral third party: a (very cute) AI judge that takes both partners' statements, weighs them, and issues a verdict with a ruling, the reasoning, and a "sentence" — a small make-up action to close the case.

## How it works

```
Partner A states their case   ─┐
                               ├─►  Judge Paw  ─►  ⚖️ VERDICT
Partner B states their case   ─┘                   • Ruling (who, how much)
                                                    • Reasoning (fair, sees both sides)
                                                    • Sentence (a make-up action)
```

## Demo flow (3-min pitch)

1. **The board** — a Miro board lays out the courtroom: the user journey, the "judicial process," and why this workflow is broken today.
2. **The build** — open Judge Paw, both partners type their side, hit **Render Verdict**.
3. **The verdict** — Judge Paw delivers a warm, funny, genuinely-balanced ruling. Case closed. 🐾

## Board → Build

| Stage | Tool | Artifact |
|-------|------|----------|
| Plan  | **Miro** | Public board: strategy, user journey, judicial process, metrics, pitch |
| Build | **Kiro** | This repo — spec-driven, see [`.kiro/specs/`](.kiro/specs/judge-paw/) |
| Ship  | —    | Working prototype + 3-min demo |

### Built with Kiro (spec-driven)

This app wasn't hand-written — it was built with [Kiro](https://kiro.dev)'s spec-driven workflow. The living spec lives in [`.kiro/specs/judge-paw/`](.kiro/specs/judge-paw/):

- [`requirements.md`](.kiro/specs/judge-paw/requirements.md) — user stories + acceptance criteria
- `design.md` — technical design _(generated next in Kiro)_
- `tasks.md` — implementation checklist _(generated next in Kiro)_

## Tech stack

- **Frontend:** _(TBD in design phase — likely React + Vite)_
- **Brain:** Anthropic Claude — renders the verdict from both statements
- **Planning:** Miro Developer Platform
- **Built with:** Kiro (AI IDE, spec-driven development)

## Links

- 🎨 Miro board: _(add public link)_
- 🎬 Demo video: _(add link)_

---

## Status

🚧 Hackathon build in progress — Miro × Kiro LA Hackathon.

## License

[MIT](LICENSE)
