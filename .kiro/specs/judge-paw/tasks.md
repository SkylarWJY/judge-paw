# Tasks — Judge Paw

Implementation plan. Each task maps to requirements in `requirements.md` and the design
in `design.md`. Check off as Kiro completes them.

## 1. Project setup
- [ ] 1.1 Scaffold Vite + React + TypeScript app
- [ ] 1.2 Add base styling/theme matching the existing Judge Paws design (colors, fonts)
- [ ] 1.3 Set up the serverless function directory (`/api`) and local dev proxy

## 2. Case intake (Requirement 1)
- [ ] 2.1 Build `CaseIntake`: topic field + Partner A / Partner B statement inputs
- [ ] 2.2 Client-side validation: block submit when either statement is empty (1.2)
- [ ] 2.3 Wire "Render Verdict" to call `/api/verdict` with `CaseInput` (1.3)

## 3. Verdict engine (Requirement 2)
- [ ] 3.1 Implement `/api/verdict` serverless function holding `ANTHROPIC_API_KEY`
- [ ] 3.2 Define the `render_verdict` tool schema = `Verdict` type; force `tool_choice`
- [ ] 3.3 Write the Judge Paw system prompt: persona + fairness contract (must cite both)
- [ ] 3.4 Implement the safety gate → `safety: "declined"` on unsafe input (2.3)
- [ ] 3.5 Validate model output against schema; retry once on malformed output

## 4. Verdict presentation (Requirement 3)
- [ ] 4.1 Build `Deliberating` "Judge Paw is thinking" animation
- [ ] 4.2 Build `VerdictCard`: separate Ruling / Reasoning / Sentence with gavel + persona (3.2)
- [ ] 4.3 Render the declined-safety state gently
- [ ] 4.4 Add `NewCaseButton` to reset to intake (3.3)

## 5. Polish & ship
- [ ] 5.1 Error/empty/loading states pass a manual QA sweep
- [ ] 5.2 Visual match check against the existing Judge Paws design
- [ ] 5.3 README: setup, architecture, how Kiro built this
- [ ] 5.4 Deploy (GitHub Pages or Vercel) and add the live link

## 6. Stretch (hackathon bonus)
- [ ] 6.1 Miro integration: read a "case file" board via Miro API/MCP as input
- [ ] 6.2 Render the verdict back onto the Miro board as a ruling card
