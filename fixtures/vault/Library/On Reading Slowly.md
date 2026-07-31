---
type: article
title: "On Reading Slowly"
author: "Marisol Vane"
url: "https://example.invalid/on-reading-slowly"
status: read
finished: 2025-09-02
tags: [essays]
---

## Notes

NOTE_BODY_CANARY_do_not_ship

**Not a book, and not malformed either.** This note lives in `Library/` and has
perfectly good frontmatter — it simply isn't `type: book`.

The distinction matters: a note that is not a book must be **ignored silently**.
It is not an error, so it must not produce a warning. Only `type: book` notes
that fail to parse deserve one. A parser that warns about this file is crying
wolf, and a vault full of non-book notes would drown the real warnings.
