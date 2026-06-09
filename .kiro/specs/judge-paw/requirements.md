# Requirements — Judge Paw

## Introduction

Judge Paw is an AI judge that resolves a couple's dispute by hearing both sides and
issuing a fair, warm, lightly-humorous verdict. The goal of the hackathon slice is a
working web prototype: two text inputs → one rendered verdict.

## Glossary

- **Statement** — one partner's written description of their side of the dispute.
- **Verdict** — the AI judge's output: a ruling, the reasoning, and a sentence.
- **Sentence** — a small, concrete make-up action assigned to close the case.

## Requirements

### Requirement 1 — Submit both sides

**User story:** As a couple, we want to each enter our side of an argument, so that a
neutral judge can hear us both before ruling.

#### Acceptance criteria

1. WHEN the page loads THEN the system SHALL display two labeled statement inputs
   (Partner A, Partner B) and a topic field.
2. WHEN either statement is empty AND the user submits THEN the system SHALL block
   submission and prompt for the missing side.
3. WHEN both statements are provided AND the user clicks "Render Verdict" THEN the
   system SHALL send both statements to the verdict engine.

### Requirement 2 — Render a fair verdict

**User story:** As a couple, we want a balanced ruling that shows it understood both
sides, so that both of us feel heard.

#### Acceptance criteria

1. WHEN both statements are received THEN the system SHALL return a verdict containing
   a ruling, reasoning that references BOTH statements, and a sentence.
2. WHEN the verdict is generated THEN the reasoning SHALL acknowledge at least one
   valid point from each partner.
3. IF the dispute statements are abusive or unsafe THEN the system SHALL decline to
   rule and surface a gentle safety message instead.

### Requirement 3 — Deliver the verdict with character

**User story:** As a couple, we want the verdict delivered by a charming judge persona,
so that a tense moment becomes a light one.

#### Acceptance criteria

1. WHEN the verdict is displayed THEN the system SHALL present it in the Judge Paw
   persona: warm, fair, lightly playful — never cruel or dismissive.
2. WHEN the verdict renders THEN the system SHALL visually separate Ruling, Reasoning,
   and Sentence.
3. WHEN a verdict is shown THEN the system SHALL offer a "New Case" action to reset.

## Out of scope (this slice)

- Accounts, history, or saving past cases.
- Real-time/multiplayer two-device input.
- Voice or image input.
