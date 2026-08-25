# Vanilla Three.js, not react-three-fiber

The shelf is built with plain Three.js in an Astro island, with no React on the page.

Agent-written code does not need React's ergonomics, and R3F plus drei is two more dependencies whose version churn would land on a scene that is drawn once and then barely changes.

## How this was decided

*Carried verbatim from the Decision Log this repository kept from July 2026, newest last.*

- **2026-07-31** — Chose vanilla Three.js over R3F — agent-written code doesn't need React ergonomics; avoids R3F/drei version churn; keeps the Astro island React-free.
