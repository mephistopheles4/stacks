# Audible via Libation, not Audiobookshelf

The first import source is an Audible library export produced by Libation, mapped into the vault by a source-specific mapper over a source-agnostic `importBooks`. An Audiobookshelf importer would need only a new mapper.

The brief named Audiobookshelf; the owner had a Libation export in hand and no self-hosted ABS instance. `Account` and `Description` are never imported — the first is an email address, the second is somebody else's marketing copy.

## How this was decided

_Carried verbatim from the Decision Log this repository kept from July 2026, newest last._

- **2026-07-31** — **The first import source is Audible via Libation's JSON export, not Audiobookshelf.** The brief named Audiobookshelf; the owner had a Libation export in hand and no self-hosted ABS instance. The gate's real content — dedupe by ISBN then normalised title+author, and a re-run that adds nothing — is met and tested either way. An ABS importer would reuse `importBooks` unchanged; only the mapper is source-specific.

- **2026-07-31** — **`BookInput.extra` carries keys outside the frontmatter contract.** The parser has always tolerated extra keys (invariant 5), but the *writer* silently dropped them, so an import could not keep the narrator, ASIN and runtime it found. Contract keys always win, so an import cannot smuggle in a different `title` through the side door.

- **2026-07-31** — **`Account` and `Description` are never imported.** The first is the owner's email address; the second is the publisher's marketing copy — someone else's text. Tested by asserting neither appears anywhere in the mapped output.

- **2026-07-31** — **`DateAdded` used as `finished`, on the owner's instruction.** The export has no date-finished field at all. It turned out to vary per book (April–July 2026) rather than being one scan timestamp, so it is a reasonable proxy for reading order — but it is still the date a book entered the Audible library, not the date it was finished.
