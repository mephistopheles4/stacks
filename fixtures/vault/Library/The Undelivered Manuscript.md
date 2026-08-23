---
type: book
title: "The Undelivered Manuscript
author: Petra Ovsyannikova
status: read
  finished: 2025-08-14
tags: [unfinished, broken
---

## Notes

NOTE_BODY_CANARY_do_not_ship

**This file is malformed on purpose. Do not fix it.**

The frontmatter above is genuinely unparseable YAML: an unterminated quoted
string, an impossible indent, and an unclosed flow sequence. It is the fixture
for invariant 3 — `stacks build` must warn naming this file, skip it, and keep
going. One bad note must never break the build.

The canary phrase above is here deliberately. Phase 3's grep gate checks that no
note body reaches the public build, and putting the canary in the file that gets
_skipped_ means the gate cannot pass merely because this book was dropped.
