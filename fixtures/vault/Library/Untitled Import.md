---
type: book
author: "Unknown"
isbn: "9781000000061"
status: read
finished: 2025-04-11
tags: [imported]
---

## Notes

**Also broken on purpose. Do not add a title.**

The YAML here parses perfectly well — the problem is that `title` is missing,
and `title` is one of only two required keys. This is a _different_ failure from
unparseable YAML, and it deserves its own skip-with-warning path.

A book that cannot be named cannot be shelved.
