---
type: book
title: A Book Kept Back
author: Wren Abelard
status: read
finished: 2026-02-14
private: true
cover: covers/a-book-kept-back.png
tags:
  - fiction
---

NOTE_BODY_CANARY_do_not_ship

This one exists so the "no private book ever ships" assertion is not vacuous.
A gate that checks a property no fixture exhibits passes no matter what the
code does — the same trap `gate:public` avoids by failing when its canary is
missing from the vault.

Its cover is larger than the shelf's 512px, so a public build that staged a
held copy for it would have one to stage: the "no held copy for a private book"
assertion is not vacuous either. Deliberately has a body, so it is also
carrying the canary.

## Thoughts

NOTE_BODY_CANARY_do_not_ship

A private book's Thoughts reach no notes file, in a public build or a local one,
so the canary sits inside the section itself rather than below it.
