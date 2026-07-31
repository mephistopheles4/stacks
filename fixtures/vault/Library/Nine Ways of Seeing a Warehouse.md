---
type: book
title: "Nine Ways of Seeing a Warehouse"
author: "Ada Whitlock, Bo Ferreira, Chen Mei-Lin, Dara Okafor, Emil Novak, Farida Haddad, Greta Lindqvist, Hugo Marchetti, Ivan Petrov"
asin: "B0FIXTURE1"
status: read
started: 2025-05-02
finished: 2025-06-30
rating: 3
cover: covers/nine-ways-of-seeing-a-warehouse.png
pages: 410
tags: [essays, logistics, anthology]
---

## Notes

NOTE_BODY_CANARY_do_not_ship

Nine-author edited volume. Two things here are load-bearing for the parser:

- there is no `isbn` key at all — this book is identified by `asin`, which is
  **not** part of the frontmatter contract. An extra key like this must be
  tolerated, not treated as an error (invariant 5).
- the author list is long enough to break naive fixed-width layout assumptions.
