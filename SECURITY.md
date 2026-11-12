# Security

The threat model, boundaries first, is [`docs/threat-model.md`](docs/threat-model.md).

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** — the "Report a
vulnerability" button under this repository's Security tab. It goes to the
maintainer and nobody else.

Do not open a public issue for anything the threat model names, or anything that
would let a crafted note, a crafted API response, or a crafted import file reach
outside the vault.

This is a personal project maintained by one person. There is no SLA and no
bounty. What you will get is an honest answer and, if the finding is real, a
gate that keeps it fixed — this repository's habit is that a defect earns a
named test that goes red, not just a patch.
