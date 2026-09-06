# Product

## Register

product

## Users

- **Form designers** — Salesforce admins and ops people (not developers). They already know Lightning conventions (record pages, App Builder, declarative rule builders). They design and publish data-entry forms and surveys, usually mid-task inside the org.
- **Form fillers** — internal users and anonymous guests who receive a published form. Zero training, often mobile, no tolerance for friction.

## Product Purpose

A 100% native Salesforce form builder + runtime ("Native Forms & Surveys"), shipping as a 2GP managed package for AppExchange. Forms bind to real SObjects and write real records through the platform's own security model — no external service, no iframe, no third-party data processor. Success = an admin can build, theme, and publish a beautiful multi-page form in minutes, and the published render is indistinguishable from a hand-crafted branded page.

## Brand Personality

Native, confident, craft-forward. The **builder** should feel like Lightning App Builder's better-dressed sibling — familiar Salesforce patterns, denser and faster. The **published form** is the showpiece: layout × theme mix-and-match (7 layouts × 30+ curated themes) that looks like a designed product page, never like "a Salesforce form."

## Anti-references

- The legacy formStudio shells: repeated headers, Submit on every page, doubled progress indicators, fixed-height scroll traps — the documented bug reel IS the anti-checklist.
- Typeform/JotForm-style "your data on our servers" — the product's entire moat is nativeness.
- The rejected 3-step creation wizard — creation is gallery-first, pick-and-go.
- Raw-expression logic builders — conditional logic follows the Lightning record-page declarative pattern.

## Design Principles

1. **One source of truth, one renderer** — preview IS the published render (one-parser rule); settings that don't visibly change the form don't ship.
2. **Earned familiarity** — native SLDS/base components and Lightning patterns first; invent only where the payoff is visible to the form filler.
3. **Decoupled layout × theme** — any theme on any layout; no setting may quietly break another surface (token-type contract, container queries).
4. **Progressive disclosure over sprawl** — few primary controls, Advanced behind a fold; the old build died of 40-token sprawl and dead controls.
5. **Deploy-and-verify** — a change isn't done until render-verified in the org; jest-green is not done.

## Accessibility & Inclusion

WCAG 2.1 AA posture for the published runtime (guest-facing surface): axe-clean rendering, single SR announcement per field, keyboard path per nav primitive, `prefers-reduced-motion` honored, 4.5:1 text contrast — with a contrast badge planned in the theme editor to keep admins' custom themes compliant.
