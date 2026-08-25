# Triage Labels

The engineering skills speak in terms of five canonical triage roles. This file
maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## These labels exist on the repo

All five were created in August 2026. `wontfix` was already there as one of
GitHub's defaults and was left alone rather than recreated; the other four were
added with the descriptions in the table above. Recreating one is one command:

```bash
gh label create needs-triage --description "Maintainer needs to evaluate this issue" --color fef2c0
```

**The issue forms deliberately do not apply any of them.**
`.github/ISSUE_TEMPLATE/*.yml` sets no `labels:` key, so a new issue arrives
unlabelled and gets triaged by a person. That was the right call while these
labels did not exist — a form naming a missing label applies nothing, silently —
and it stays the right call now for a different reason: an auto-applied
`needs-triage` on every issue carries no information, because it would be true
of all of them.

Nothing here is required to file an issue or open a pull request. An issue with
no labels at all is a perfectly good issue.

The `wayfinder:*` labels are a separate set, described in
[`issue-tracker.md`](./issue-tracker.md), and already existed.
