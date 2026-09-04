import * as THREE from 'three';
import { hashUnit } from './hash.ts';

/**
 * The bookcase's veneer — one sheet, laid at its true size, with the grain
 * running along each member's own long axis.
 *
 * The owner's report was that the furniture holding the library reads as tinted
 * plastic ([#279](https://github.com/mephistopheles4/stacks/issues/279)): every
 * plank, upright and backboard was one flat `MeshStandardMaterial` with no map
 * in any slot. This is the pigment half of the answer, chosen on a live build
 * across nine decision tickets under map
 * [#280](https://github.com/mephistopheles4/stacks/issues/280) and locked in
 * [`docs/spec/the-woodwork-reads-as-wood.md`](../../../../docs/spec/the-woodwork-reads-as-wood.md).
 *
 * ## The two decisions behind this file
 *
 * - [ADR-0080](../../../../docs/adr/0080-the-woodwork-is-rosewood-and-its-relief-is-drawn.md)
 *   — **what the woodwork is.** Why rosewood when the request was koa and the
 *   choice was sapele, that species and resolution are one choice, that a
 *   photographed veneer's normal map is a measured zero while a drawn fibre is
 *   not, and that anisotropic specular is struck on the physics.
 * - [ADR-0081](../../../../docs/adr/0081-the-woodwork-sheet-is-a-menu-and-the-shelf-says-what-it-resolved.md)
 *   — **whether that choice stays revisitable**, which 0080 deliberately does
 *   not decide. The roster, the laziness, the rebuild class and the read-back.
 *
 * ⚠️ **The rule the two share, because it is the one most easily lost:** a
 * control may be exposed when its meaning is independent of the controls beside
 * it, and not otherwise. That is why the species is a knob and the resolution
 * never can be — `resolution / unitsPerTile` means something different under
 * each entry of the menu beside it, where a species carries its own resolution
 * with it.
 *
 * ## Why this module exists rather than living in `scene.ts`
 *
 * `buildShelf` needs a WebGL context and is not a test seam — `scene.ts` sits
 * outside every mutation scope for exactly that reason, and its own comment
 * states the pattern: *all of the arithmetic happens first, in a module with no
 * Three.js in it*. The UV rewrite below is arithmetic, and `scene.ts` calls it.
 *
 * ## What is deliberately absent
 *
 * ⚠️ **The sheet's own normal map is not bound, and must not be.** A flat-sliced
 * veneer is peeled off a log and has almost no relief to encode:
 * [#284](https://github.com/mephistopheles4/stacks/issues/284) measured
 * rosewood's normal map at **0.000% above the just-noticeable threshold at every
 * rung, on two different sheets**, and proved that was the surface rather than
 * the harness by driving the same pipe at `normalScale 8` for 2.684%. Relief
 * arrives as a *drawn* fibre instead — the second half of this file, and
 * [#303](https://github.com/mephistopheles4/stacks/issues/303).
 *
 * ⚠️ **`roughnessMap` is struck.** Poly Haven publishes none for this sheet.
 * Sapele's measured 1.029% and inverted the prior — a finding with no home.
 *
 * ⚠️ **The backboard is a second sheet and not this one.**
 * [#304](https://github.com/mephistopheles4/stacks/issues/304) gives it
 * `dark_wood` at 512, because the darkness constraint left one candidate of 41.
 * Everything below that takes a sheet takes it as an argument for that reason:
 * two surfaces, two sheets, and **the axis swap is read from the sheet being
 * bound** rather than copied from the woodwork's.
 */

/**
 * Which of a sheet's *own* texture axes its figure's stripe runs along.
 *
 * ⚠️ **Measured, never assumed.** `scripts/prototype-backboard-survey.ts` on
 * [`prototype/297-backboard-sheet`](https://github.com/mephistopheles4/stacks/tree/prototype/297-backboard-sheet)
 * downloaded all 41 veneers in Poly Haven's `Wood/Veneer/` branch and reported
 * each one's column-mean spread over its row-mean spread: above 1 the stripe
 * runs down `v`, below 1 across `u`. Sapele reads **2.67** and `dark_wood`
 * **0.08** — the other way round. Copying one sheet's answer onto another lays
 * it sideways, and #297's own numbers all sat in the normal range while it did.
 */
export type Figure = 'u' | 'v';

/** What laying a sheet on a member needs to know about it. */
export interface SheetLay {
  /** World units one tile of the sheet covers, at its true published size. */
  readonly unitsPerTile: number;
  readonly figure: Figure;
}

/** A committed sheet: where it is served from, how it lays, and its flat twin. */
export interface Sheet extends SheetLay {
  readonly url: string;
  /** The mean-matched flat twin, computed in linear light, for this resolution. */
  readonly mean: number;
}

/**
 * The woodwork's sheet, and the numbers that are properties of it rather than
 * dials.
 *
 * **Poly Haven `rosewood_veneer1`, CC0**, diffuse only, at 1024. Its published
 * sheet is 2430 mm and this scene's unit is about 0.30 m — `MAX_HEIGHT` is 0.95
 * for a book that would stand about 290 mm — so `7.68` is the size the veneer
 * really is, not a number that looked nice.
 *
 * ⚠️ **Resolution and species are coupled and neither is a knob.** What the eye
 * reads is `resolution / unitsPerTile`, so rosewood's 1024 over 7.68 units is
 * about 133 texels per world unit where sapele's would be 640. A bigger sheet
 * buys away the repetition — one tile of this one is wider than the whole
 * bookcase, so it never repeats on this case at all — and pays for it in texels.
 * That trade was walked on #284 and settled; laying the sheet *smaller* than
 * life to buy texel density back was rejected by eye, twice, because it brings
 * the repetition with it and repetition is the complaint.
 *
 * ⚠️ **`mean` is the sheet's mean-matched flat twin, computed in linear light**
 * by `scripts/prototype-wood-maps.ts` on `prototype/284-woodwork-channels` from
 * this exact 1024 map. Shading multiplies a linear albedo by a linear radiance,
 * so the flat colour that renders to the same average is
 * `linearToSRGB(mean(sRGBToLinear))`; the naive sRGB-byte average lands a step
 * off in green. ⚠️ **It is per resolution**, because a resize is a blur and a
 * blur moves an average — rosewood's moves by one step in two channels between
 * 512 and 1024. Taken from the branch rather than recomputed: this is the twin
 * for the map that ships, and a twin that matches a different map matches
 * nothing.
 */
export const WOODWORK_SHEET = {
  url: '/wood/rosewood-diff-1024.jpg',
  unitsPerTile: 7.68,
  mean: 0x6e3412,
  /**
   * ⚠️ **The one `figure` on this table that is not a strong measurement.**
   * #297's survey reads rosewood at **0.69**, where sapele is 2.67 and
   * `dark_wood` 0.08: it is a book-matched *figured* sheet rather than a striped
   * one, so it has no dominant axis for that ratio to find. `v` is the lay the
   * renders under #284 and #302 were judged at, which is a stronger warrant than
   * a ratio near 1 — and it is recorded as a fact about this image so that the
   * sheet beside it can disagree.
   */
  figure: 'v',
} as const satisfies Sheet;

/**
 * The backboard's sheet — a different image, chosen against a constraint the
 * woodwork's did not have.
 *
 * **Poly Haven `dark_wood`, CC0**, diffuse only, at 512.
 * [#297](https://github.com/mephistopheles4/stacks/issues/297) downloaded all 41
 * veneers Poly Haven publishes and measured each mean in linear light: against
 * `woodDark`'s luma of 56.5 exactly **two** land within 5 — this sheet at −4.6,
 * and `rosewood_veneer1` at +3.9, which is the woodwork's own. **The
 * third-nearest is +24.8 away**, about half the distance from the backboard to
 * the planks. So there was no menu to build here, and
 * [#281](https://github.com/mephistopheles4/stacks/issues/281)'s four-species
 * shape does not transfer to a surface the books have to read against.
 *
 * ⚠️ **512 resolves it, and that is measured rather than economised.** 512
 * against 1024 is 0.368% of frame at zoom 10 and 0.527% at `minDistance` — for
 * four times the bytes, against the drawn fibre's 0.704% for none. Its tile is
 * wider than the whole bookcase either way, so it never repeats on this case.
 *
 * ⚠️ **`figure: 'u'` is the opposite of the woodwork's, and that is the whole
 * point of the field.** #285 states the backboard's grain runs **vertically**;
 * a sheet whose stripe runs along `u` therefore needs the swap an upright does
 * *not* need on rosewood. Hard-coding the woodwork's constant here would have
 * laid this sheet sideways and looked like a verdict about the sheet.
 *
 * ⚠️ **The direction cannot be derived from the board's long axis** — it is
 * wider than tall at 2 and 3 rows and taller than wide from 4 on, so that rule
 * would turn the grain 90° the day the library fills its third row.
 */
export const BACKBOARD_SHEET = {
  url: '/wood/darkwood-diff-512.jpg',
  /**
   * `dark_wood`'s published sheet is 2000 mm. #297's arms lay it at **6.37**
   * world units, taking 314 mm per unit — the midpoint of the two figures
   * `prototype-wood.ts` implies by hand, whose 1% spread is well under anything
   * a render can see. This is the size the rendered-and-accepted arm used.
   */
  unitsPerTile: 6.37,
  mean: 0x5f2c19,
  figure: 'u',
} as const satisfies Sheet;

/**
 * The other sheet that has actually been rendered and measured — the menu's
 * second entry, and the one that earned the flat entry beside it.
 *
 * **Poly Haven `sapele_veneer`, CC0**, diffuse only, at 512.
 * [#281](https://github.com/mephistopheles4/stacks/issues/281) chose it on sound
 * reasoning and [#284](https://github.com/mephistopheles4/stacks/issues/284)'s
 * render disagreed: against today's flat shelf it moves **20.53% of frame**, of
 * which only **1.32% is grain** — 94% of what it does is its average colour
 * being a different colour. It is kept in the roster because *that* is worth
 * being able to see again, not because the choice is reopened.
 *
 * ⚠️ **512 here against rosewood's 1024, and the pair is the point.** What the
 * eye reads is `resolution / unitsPerTile`: this sheet's published 500 mm is
 * **1.6** world units, so 512 over 1.6 gives **320** texels per world unit where
 * rosewood's 1024 over 7.68 gives **133**. Species and resolution are coupled
 * and neither may be moved alone — which is why there is no resolution knob
 * beside the species one, and why each entry on this roster carries its own.
 *
 * ⚠️ **The price of those texels is repetition**, which is the complaint this
 * whole map started from: one tile of this sheet is 1.6 units against a 3.58
 * unit plank, so it repeats about 2.2 times along one board, where rosewood's
 * tile is wider than the whole bookcase and never repeats at all.
 *
 * ⚠️ **`figure: 'v'` is a strong measurement here**, unlike rosewood's.
 * #297's survey reads sapele at **2.67** — a flat-sliced veneer with a fine,
 * low-contrast stripe running top to bottom — where `dark_wood` reads 0.08 the
 * other way. `mean` is its 512 map's mean-matched twin, computed in linear light
 * by `scripts/prototype-wood-maps.ts` on `prototype/284-woodwork-channels`; the
 * naive sRGB-byte average lands `0xc68059`, one step off in green.
 *
 * ⚠️ **Its roughness map is not bound and does not ship.** Sapele is the only
 * sheet of the three that publishes one, and binding a channel on one roster
 * entry and not the others would make the menu compare two things at once. It
 * measured 1.029% and inverted the prior — a finding with no home.
 */
export const SAPELE_SHEET = {
  url: '/wood/sapele-diff-512.jpg',
  unitsPerTile: 1.6,
  mean: 0xc68159,
  figure: 'v',
} as const satisfies Sheet;

/**
 * The woodwork sheet menu, as a named choice — every sheet that has actually
 * been **rendered and measured**, plus the comparison entry.
 *
 * ⚠️ **Three, where [#281](https://github.com/mephistopheles4/stacks/issues/281)
 * settled four.** Only two species were ever downloaded and rendered, and a
 * third or fourth would mean committing a sheet nobody has looked at — the shape
 * of decision this map refused four times. Going back to four is a download and
 * a render, **not a code change**.
 *
 * ⚠️ **It governs the woodwork only.** The backboard's sheet is a constant:
 * [#297](https://github.com/mephistopheles4/stacks/issues/297) measured all 41
 * veneers in Poly Haven's `Wood/Veneer/` branch and the darkness constraint
 * leaves exactly one candidate, with the third-nearest 24.8 luma away. So the
 * panel's control is labelled *woodwork sheet* rather than *wood species*, so it
 * does not read as governing a surface it cannot move.
 */
export type WoodSpecies = 'rosewood' | 'sapele' | 'flat';

/**
 * A species as **requested**, which is not the same type as a species that
 * resolved — and the distinction is load-bearing rather than pedantic.
 *
 * ⚠️ **`ShelfSettings` can genuinely hold a string off this roster.**
 * `readTune` validates `toneMapping` against `TONE_MAPPING_NAMES` and checks
 * `exposure` is finite, but passes `materials` through as an opaque record —
 * `isRecord(tune.materials) ? tune.materials : {}` and nothing more — so
 * `?tune={"materials":{"woodSpecies":"walnut"}}` arrives with `walnut` in the
 * settings object. Typing the field as the roster alone would be **the type
 * asserting something the runtime does not guarantee**, which is a control
 * lying in the one place nothing can go red.
 *
 * The value has to survive that far, too: #300 requires an unrecognised species
 * be *"refused and reported rather than silently defaulted"*, so it cannot be
 * dropped at parse — and a refusal can only name what was asked for if what was
 * asked for is still there to name.
 *
 * ⚠️ **The union is kept beside the widening on purpose.** `WoodSpecies | (string & {})`
 * still offers the three names to anything *writing* the field — the panel's
 * menu, `DEFAULT_SETTINGS`, a spec — while telling everything *reading* it that
 * the value is untrusted and belongs in `resolveWoodwork`. Widening it to bare
 * `string` would lose the roster at every write site, which is where the
 * autocomplete is worth having.
 */
export type RequestedSpecies = WoodSpecies | (string & {});

/**
 * The roster, in menu order, so the panel and the specs walk one list.
 *
 * `flat` last, because it is the control rather than a species: it is what
 * separates *a sheet that moved the grain* from *a sheet that moved the average
 * colour*, which is the distinction sapele's 20.53% needed and no whole-frame
 * number supplies on its own.
 */
export const WOOD_SPECIES: readonly WoodSpecies[] = ['rosewood', 'sapele', 'flat'];

/**
 * Which image each roster entry binds — and `undefined` for the one that binds
 * none.
 *
 * ⚠️ **`flat` is an absent sheet and not a third image.** It binds no map at
 * all, so the surface shows `materials.wood`, which `woodColour` already returns
 * whenever nothing is bound: the flat entry is the *fallback arm made
 * permanent*, out of machinery that already had to exist for a sheet that never
 * arrives. Giving it its own hex here would be a second copy of the knob, and
 * the copy that drifted would make the control lie.
 *
 * ## ⚠️ Where this diverges from #306, stated rather than glossed
 *
 * [#306](https://github.com/mephistopheles4/stacks/issues/306) asks for *"no map
 * at all, at the **selected sheet's** mean-matched hex"*. **On the prototype,
 * `flat` was an arm orthogonal to the species** — `?woodSpecies=sapele&wood=flat`
 * was a reachable pair, so "the selected sheet" named a sheet that was still
 * selected. Shipped, the ticket's own roster makes `flat` a **peer** of the two
 * species rather than a modifier of them, and a peer has no selected sheet to
 * take a hex from: the phrase has no referent once the shape it was written for
 * is gone.
 *
 * So this resolves `flat` to the **default** sheet's twin, at the default's
 * resolution, and the consequence is worth naming: **the isolation that caught
 * sapele is not reachable from the shipped menu.** Comparing `flat` against
 * `rosewood` isolates rosewood's grain, which is the comparison the shipped
 * treatment is judged on. Comparing `flat` against `sapele` moves the average
 * colour *and* the grain together, which is the confound the entry exists to
 * remove — and separating those two for sapele needs `?woodSpecies=sapele`
 * beside a `flat` *toggle*, which is the prototype's two-control shape and not
 * the roster this ticket specified.
 *
 * ⚠️ **`SAPELE_SHEET.mean` is therefore recorded and not read at runtime.** It
 * is kept because it is a measurement of a committed file — the twin for *that*
 * map, in linear light — and because restoring the prototype's pairing is a
 * control change rather than a re-measurement if anybody wants it back.
 */
const WOODWORK_SHEETS: Readonly<Record<WoodSpecies, Sheet | undefined>> = {
  rosewood: WOODWORK_SHEET,
  sapele: SAPELE_SHEET,
  flat: undefined,
};

/** What the roster falls back to, and what a page with no opinion resolves to. */
export const DEFAULT_SPECIES: WoodSpecies = 'rosewood';

/**
 * Every sheet a **default** page fetches, so a gate can hold the caps to what
 * actually ships rather than to whatever is lying in the directory.
 *
 * ⚠️ **Two, and neither is the menu's.**
 * [#306](https://github.com/mephistopheles4/stacks/issues/306)'s other species
 * load only on selection, so sapele is committed and **not in this list**; the
 * backboard's is a constant and is always fetched, so a row counting *woodwork*
 * sheets must not count that one. `ALL_SHEETS` is the other question — what is
 * committed — and the two are deliberately different sets.
 */
export const SHIPPED_SHEETS: readonly Sheet[] = [WOODWORK_SHEET, BACKBOARD_SHEET];

/**
 * Every sheet any resolution can name, whether or not a default page fetches it.
 *
 * ⚠️ **The menu is exactly the way a committed file stops being pointed at.**
 * G52's directory sweep caps what is *in* the directory and one of its clauses
 * checks the other direction — that every URL this module resolves names a file
 * that is really there. Against `SHIPPED_SHEETS` alone that clause would stop
 * covering sapele the moment it landed: a file in the directory, capped, and
 * reachable through a menu entry nothing asserted the existence of. On a live
 * build a missing one is a 404 and a surface left at its fallback colour, which
 * looks exactly like a texture nobody bound.
 */
export const ALL_SHEETS: readonly Sheet[] = [WOODWORK_SHEET, SAPELE_SHEET, BACKBOARD_SHEET];

/**
 * What a requested species actually resolves to — the sheet, and the refusal if
 * there is one.
 *
 * ## Why this is a function and not a lookup at the call site
 *
 * It is the seam the two gate rows this ticket owes both assert on.
 *
 * **A default page fetches exactly one woodwork sheet**, asserted here rather
 * than on the network — G21 (`no-live-network`) records any request the suite
 * makes, so what is checked is the resolved URL and never the bytes. That row
 * has teeth **because the menu ships**: with a single hard-coded sheet it would
 * assert nothing, and with a menu a fifth entry could quietly cost every visitor
 * a download.
 *
 * **The resolved configuration is the reported configuration.** `applySettings`
 * names what came out of here, and this returns the refusal for it to name.
 *
 * ⚠️ **This map earned that second row three times, and all three were the same
 * failure.** #284's resolution control built each URL as a fixed base plus a
 * per-arm tail, so `woodRes=1024&woodRes=512` arrived and `URLSearchParams.get`
 * returns the **first** — the arm meant to render 512 rendered 1024 and reported
 * a perfect zero at every rung. #298's `woodVary` resolved an *absent* parameter
 * to `0` against its own documented default of `1`, because `Number(null)` is
 * `0` rather than `NaN`, disarming the variation in every render its branch
 * took. #297's fibre was bound at 90° to its figure and every whole-frame number
 * sat in the normal range. **A query string is an assumption until something
 * states what came out of it.**
 *
 * ## Refused, and not silently defaulted
 *
 * An unrecognised name still has to render *something* — there is no bookcase
 * with no colour on it — so it falls back to the default. What it must not do is
 * fall back **quietly**: `refused` is the string `applySettings` puts in
 * `ApplyReport.refused`, so a `?tune=` carrying a typo shows the default shelf
 * and *says* it is showing the default shelf. A silent fallback is the shape of
 * every defect in the paragraph above.
 *
 * ⚠️ **Refused at resolution rather than dropped at parse.** `cover_source`'s
 * rule in the frontmatter contract drops an unrecognised value, and that is
 * right for a note nobody is watching; a control somebody just moved is the
 * opposite case, because the whole standing rule here is that **a control must
 * not lie** and a dropped value looks like a value that was applied.
 *
 * ⚠️ **And nothing upstream would catch it, which is why the refusal has to be
 * here.** `readTune` validates `toneMapping` against `TONE_MAPPING_NAMES` and
 * checks `exposure` is a finite number, but passes `materials` through as an
 * opaque record — `isRecord(tune.materials) ? tune.materials : {}` and nothing
 * more. Every other `materials` key is a number or a nested object of numbers,
 * so `woodSpecies` is the **first string-valued key in there and the first one
 * where an invalid value can mean something**. That asymmetry is why
 * `?tune={"materials":{"woodSpecies":"walnut"}}` arrives here intact while
 * `?tune={"toneMapping":"walnut"}` never would, and the next string-valued
 * `materials` key will meet it too.
 */
export interface ResolvedWoodwork {
  /** The species actually in force — the request, or the default it fell back to. */
  readonly species: WoodSpecies;
  /** The sheet to bind, or `undefined` for `flat`, which binds no map at all. */
  readonly sheet: Sheet | undefined;
  /**
   * What the UVs and the fibre are laid by — **always a sheet**, even when none
   * is bound.
   *
   * ⚠️ **`flat` is laid by the default sheet, and that is what makes it a
   * control rather than a fourth look.** Its whole job is to separate *a sheet
   * that moved the grain* from *a sheet that moved the average colour*, which it
   * can only do if everything except the diffuse map is held constant: the same
   * world-space period on every face, the same fibre at the same tiling. Laid by
   * anything else it would differ from rosewood in two ways at once, and the
   * comparison that caught sapele's 94% would answer nothing.
   *
   * It is also what stops the fibre being laid wrong under a species change.
   * `worldSpaceUvs` divides every face's UVs by this sheet's world size and
   * `fibreTiles` multiplies them back up by it — 7.68 against sapele's 1.6, so
   * one constant would lay sapele's fibre **4.8× wrong** while every whole-frame
   * number stayed in range. That is #297's defect exactly, one surface over.
   */
  readonly lay: SheetLay;
  /** Why the request could not be honoured, in the report's own voice. */
  readonly refused: string | undefined;
}

export function resolveWoodwork(requested: string): ResolvedWoodwork {
  // A `find` over the roster rather than `requested in WOODWORK_SHEETS`, because
  // an object lookup answers `true` for `toString` and every other inherited
  // key — the shape of a guard that passes on a value nobody wrote.
  const species = WOOD_SPECIES.find((name) => name === requested);

  if (species === undefined) {
    return {
      species: DEFAULT_SPECIES,
      sheet: WOODWORK_SHEETS[DEFAULT_SPECIES],
      lay: WOODWORK_SHEET,
      refused:
        `woodwork sheet: "${requested}" is not a sheet anybody has rendered, so the ` +
        `woodwork is showing ${DEFAULT_SPECIES}. The roster is ${WOOD_SPECIES.join(', ')}`,
    };
  }

  const sheet = WOODWORK_SHEETS[species];
  return { species, sheet, lay: sheet ?? WOODWORK_SHEET, refused: undefined };
}

/**
 * Every woodwork sheet URL a page asking for `requested` fetches — one, or none.
 *
 * The lazy claim, stated as arithmetic so a gate can hold it: **a page fetches
 * the sheet it resolved to and no other**, so the roster can grow without
 * costing a visitor who never opens the panel a byte. Selecting sapele fetches
 * sapele's sheet *at that moment*, because the sheet is bound where the material
 * is made and a species change is a rebuild — see `applySettings`.
 */
export function woodworkSheetUrls(requested: string): readonly string[] {
  const { sheet } = resolveWoodwork(requested);
  return sheet === undefined ? [] : [sheet.url];
}

/**
 * Whether moving from one requested species to another would actually change
 * the shelf — **compared after resolution, never as raw strings.**
 *
 * ⚠️ **Two different requests can be the same bookcase.** Everything off the
 * roster resolves to `DEFAULT_SPECIES`, so `walnut` and `rosewood` name one
 * shelf. Comparing the requests offers a rebuild button for a change a rebuild
 * cannot make, and lights the panel's lamp amber over a bookcase already
 * showing what was asked for — **a control lying about being stale**, which is
 * the same rule as a control lying about being applied.
 *
 * Named once because `applySettings` and the debug panel's lamp both ask it,
 * and two copies of this comparison are two chances to compare the wrong pair —
 * the shape G10 and G23 both caught.
 */
export function speciesPending(built: string, wanted: string): boolean {
  return resolveWoodwork(built).species !== resolveWoodwork(wanted).species;
}

/** The two lists `describeWoodwork` fills, in `ApplyReport`'s own vocabulary. */
export interface WoodworkReadBack {
  /** What the shelf **is running**, stated on every apply whether or not it moved. */
  readonly resolved: readonly string[];
  /** What could not be honoured as asked, and why. */
  readonly refused: readonly string[];
}

/**
 * The read-back: what the woodwork actually resolved to, in words, every time.
 *
 * ## Why this is here rather than inline in `applySettings`
 *
 * `scene.ts` needs a WebGL context and is not a test seam — it sits outside
 * every mutation scope for that reason, and its own comment states the pattern:
 * *all of the arithmetic happens first, in a module with no Three.js in it*. The
 * strings below are that arithmetic, and the gate row this ticket owes asserts
 * on **this function** while a text clause holds `applyLive` to calling it.
 *
 * ## What it states, and why stating beats diffing
 *
 * ⚠️ **Every one of the four `ApplyReport` categories that existed before this
 * is a *transition*, and a transition cannot describe a configuration that was
 * wrong from the first frame.** This map earned that lesson three times, and not
 * one of the three was a change anybody made:
 *
 * - #284's resolution control built each URL as a fixed base plus a per-arm
 *   tail, so `woodRes=1024&woodRes=512` arrived and `URLSearchParams.get`
 *   returns the **first** — the arm meant to render 512 rendered 1024 and
 *   differenced to a perfect **0.000% at every rung, worst delta 0**.
 * - #298's `woodVary` resolved an *absent* parameter to `0` against its own
 *   documented default of `1`, because `Number(null)` is `0` rather than `NaN`.
 *   Every render that branch ever took was unvaried.
 * - #297's fibre was bound at 90° to its own figure, and every whole-frame
 *   number it produced sat in the normal range. It took a 3× crop to see.
 *
 * **A query string is an assumption until something states what came out of
 * it.** Unlike the look — which #282 settled is the owner's verdict on a live
 * build and never a number — this is machine-checkable.
 *
 * ## The two things it is careful about
 *
 * ⚠️ **The fibre is reported *in force*, never as asked for.** A browser that
 * will not give a 2D context has no map to bind, so `applyWoodFibre` returns the
 * scale that really took, and a report echoing the request would be a slider
 * that moved while the bookcase did not.
 *
 * ⚠️ **A species waiting on a rebuild says so.** `worldSpaceUvs` writes the
 * world-space period into each member's UVs in place, so a new sheet needs new
 * geometry; between setting the menu and pressing rebuild the shelf is running
 * one species and configured for another, and naming only one of them would be
 * the report agreeing with whichever half the reader guessed.
 */
export function describeWoodwork(
  wanted: ResolvedWoodwork,
  built: WoodSpecies,
  fibreInForce: number,
  fibreAsked: number,
): WoodworkReadBack {
  const sheet =
    wanted.sheet === undefined
      ? 'no map — the mean-matched flat twin'
      : `${wanted.sheet.url}, laid at ${String(wanted.lay.unitsPerTile)} world units`;
  const waiting = wanted.species === built ? '' : ` — built with ${built}, rebuild to change it`;

  const resolved = [
    `woodwork sheet: ${wanted.species} (${sheet})${waiting}`,
    `wood fibre: ${String(fibreInForce)}` +
      (fibreInForce === fibreAsked ? '' : ` (asked for ${String(fibreAsked)})`),
  ];

  // Refused *and* reported, never silently defaulted. `?tune=` carries arbitrary
  // JSON, so this key can arrive holding a typo; dropping it would look exactly
  // like a value that was applied.
  return { resolved, refused: wanted.refused === undefined ? [] : [wanted.refused] };
}

/**
 * What `material.color` must hold once the sheet is bound.
 *
 * A diffuse map **multiplies** `color`, so anything but white renders the sheet
 * darker than the image somebody judged. This is that identity, named rather
 * than written as a bare `0xffffff` at the one place it is used.
 */
export const SHEET_TINT = 0xffffff;

/** `page-edges.ts`'s number, and for its reason: these faces graze the key light. */
const ANISOTROPY = 16;

/** Which world axis a member's grain runs along. */
export type Axis = 'x' | 'y' | 'z';

/**
 * Which world axis each of a `BoxGeometry`'s six faces spans in `u`, and which
 * in `v`, in the order three builds them: `+X, -X, +Y, -Y, +Z, -Z`.
 *
 * Not a convention — it is what `BoxGeometry`'s own `buildPlane` calls do, four
 * vertices per face, `u` and `v` each running `0..1` across the named axis.
 */
const FACE_AXES: readonly (readonly [Axis, Axis])[] = [
  ['z', 'y'], // +X
  ['z', 'y'], // -X
  ['x', 'z'], // +Y
  ['x', 'z'], // -Y
  ['x', 'y'], // +Z
  ['x', 'y'], // -Z
];

/** Vertices per face. `BoxGeometry` at one segment per axis gives four. */
const CORNERS = 4;

/**
 * Rewrite a `BoxGeometry`'s UVs so one map holds a **constant world-space
 * period** on every one of its six faces, with the grain running along `grain`.
 *
 * ## Why the shipped `0..1` cannot work
 *
 * `BoxGeometry` gives every face `0..1` whatever its size, so one shared
 * `texture.repeat` cannot be right for two faces of different sizes. A plank's
 * top face is `3.58 × 0.71` and its front edge is `3.58 × 0.07` — a ten-to-one
 * difference on the axis they do not share — so a repeat that suits the top
 * smears the grain vertically on the edge, which is
 * [#284](https://github.com/mephistopheles4/stacks/issues/284)'s *most
 * plastic-looking surface today*. Multiplying each face's UVs by that face's own
 * world extent, over `unitsPerTile`, turns the shared `0..1` into a shared
 * world-space scale: one tile is `unitsPerTile` units wide on every face of
 * every member.
 *
 * ## The swap, and why it is read off the sheet
 *
 * A face swaps when the axis the member's grain runs along does not already
 * land on the axis **this sheet's** figure runs down. Naming the member's grain
 * axis and letting each face decide is what puts the figure along a plank's
 * length **and** up an upright's height out of one call — on rosewood (`v`) a
 * plank (`x`) swaps its top and front faces and leaves its end caps alone, and
 * an upright (`y`) swaps nothing.
 *
 * ⚠️ **`sheet.figure` is a fact about the downloaded image and the two sheets
 * disagree.** `dark_wood`'s stripe runs along `u`, so the backboard — grain `y`,
 * whose front face spans world `y` on `v` — takes the **opposite** swap from an
 * upright on rosewood, out of these same six lines. Copying the woodwork's
 * answer would have laid it sideways, which is what
 * [#297](https://github.com/mephistopheles4/stacks/issues/297) shipped for a
 * whole matrix while every number it produced sat in the normal range.
 *
 * ⚠️ **The direction is stated by the caller, never inferred from the size.**
 * `rowsForBookcase` grows the case with the library, so an upright's height changes
 * while a plank's length does not, and the backboard is wider than tall at two
 * rows and taller than wide from four on. A rule that took the longest axis
 * would turn the backboard's grain sideways the day a book was added — which is
 * why [#285](https://github.com/mephistopheles4/stacks/issues/285) *states* each
 * member's direction.
 *
 * ## Where the size comes from
 *
 * ⚠️ **From `geometry.parameters`, and that is structural rather than tidy.**
 * [#301](https://github.com/mephistopheles4/stacks/issues/301) shrank every
 * plank in `x` and `z` and the backboard in `x` and `y` off the planes the
 * uprights own, so a member's world size is its **post-inset** size. Handing the
 * size in as a second argument would be a second copy of `buildShelf`'s
 * arithmetic, and a copy that drifted would leave the grain's world-space period
 * subtly wrong on every member with nothing to notice. Reading it back off the
 * geometry cannot drift.
 */
export function worldSpaceUvs(geometry: THREE.BoxGeometry, sheet: SheetLay, grain: Axis): void {
  const uv = geometry.attributes['uv'];
  if (uv === undefined) return;

  const { unitsPerTile } = sheet;
  const { width, height, depth } = geometry.parameters;
  const extent: Record<Axis, number> = { x: width, y: height, z: depth };

  for (const [face, axes] of FACE_AXES.entries()) {
    const [uAxis, vAxis] = axes;
    // The grain axis is not already on the axis this sheet's figure runs down,
    // so the face's two axes exchange before scaling.
    const swap = sheet.figure === 'v' ? uAxis === grain : vAxis === grain;
    const [spanU, spanV] = swap ? [extent[vAxis], extent[uAxis]] : [extent[uAxis], extent[vAxis]];

    for (let corner = 0; corner < CORNERS; corner += 1) {
      const index = face * CORNERS + corner;
      const u = uv.getX(index);
      const v = uv.getY(index);
      const [outU, outV] = swap ? [v, u] : [u, v];
      uv.setXY(index, (outU * spanU) / unitsPerTile, (outV * spanV) / unitsPerTile);
    }
  }

  uv.needsUpdate = true;
}

/**
 * What `material.color` should carry, given the knob and whether the sheet is
 * bound.
 *
 * **`materials.wood` changes meaning with this ticket**: it becomes the colour
 * the woodwork shows *before* its sheet decodes, and if it never does. A diffuse
 * map multiplies `color`, so leaving the knob's old `0x6b4f3a` in place would
 * render the sheet at a third of its brightness — and setting white up front
 * would leave a failed load showing a **white bookcase**. Starting at the
 * sheet's mean-matched hex and switching to white inside the load callback gives
 * a byte-identical frame on success and #284's rendered-and-accepted flat arm on
 * failure.
 *
 * ⚠️ **`applySettings` has to route through this, and that is the trap.** It
 * repaints the material on any change to `materials.wood`; unrouted, one tick of
 * the debug panel or one `?tune=` would put a dark colour back under a decoded
 * sheet and darken the whole bookcase. Once the sheet is bound the knob is a
 * fallback and nothing else, and the `ApplyReport` says so rather than claiming
 * a change the eye cannot find — the map's standing rule that **a control must
 * not lie**.
 */
export function woodColour(fallback: number, bound: boolean): number {
  return bound ? SHEET_TINT : fallback;
}

/**
 * How `bindSheet` fetches — a seam, so a spec can assert the resolved URL
 * without a request.
 *
 * ⚠️ **G21 (`no-live-network`) records any request the suite makes and fails the
 * test that made it**, and `THREE.TextureLoader` needs a DOM this Vitest project
 * does not have. So the loader is a parameter with a real default, constructed
 * only when nobody supplies one.
 */
export type SheetLoader = (url: string, onLoad: () => void, onError: () => void) => THREE.Texture;

/** The real one. Built per call, because constructing it needs a document. */
function textureLoader(): SheetLoader {
  const loader = new THREE.TextureLoader();
  return (url, onLoad, onError) =>
    loader.load(
      url,
      () => {
        onLoad();
      },
      undefined,
      () => {
        onError();
      },
    );
}

/** A handle on the one sheet, for the two callers that need to ask about it. */
export interface SheetBinding {
  /** The URL that was actually requested. */
  readonly url: string;
  /** Whether the sheet has decoded and taken the material's `map`. */
  bound(): boolean;
}

/**
 * Everything a sampled sheet needs that is not its pixels.
 *
 * ⚠️ **`RepeatWrapping` on both axes is load-bearing, not housekeeping.**
 * `worldSpaceUvs` puts UVs well outside `0..1` on every face, and the default
 * `ClampToEdgeWrapping` would smear the tile's last row of texels across
 * everything past the first tile. ⚠️ **`SRGBColorSpace` is too**: without it the
 * sheet is sampled as linear data and renders far darker than the image the
 * `mean` above was computed from, so the fallback would no longer match the map
 * it stands in for.
 */
function configureSheet(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  return texture;
}

/**
 * Bind a sheet to a material, and switch its colour when it lands.
 *
 * ⚠️ **The sheet is an argument and not this module's constant**, which is what
 * lets the backboard have its own. Both surfaces take the identical treatment —
 * mean-matched hex up front, white and the map inside the callback, the flat
 * twin on failure — out of one function rather than two that drift.
 *
 * ⚠️ **The map is assigned inside the load callback rather than on the way
 * out**, which is the one place this differs from the prototype and it is the
 * difference between the two failure modes. `TextureLoader.load` returns a
 * `Texture` whose image is filled in later, so a material holding it through a
 * *failed* load carries a map with no pixels — and what the visitor gets then is
 * whatever the renderer substitutes, not the flat brown this ticket promises.
 * Assigning both the map and the white tint in the callback costs one shader
 * recompile at boot and makes the promise literal: **no sheet, no map, the
 * fallback colour**.
 *
 * One request. Resolving inside the callback and calling `load` again for the
 * return value would fetch the file twice, and the +1 texture this ticket
 * reports would be a lie.
 */
export function bindSheet(
  material: THREE.MeshStandardMaterial,
  sheet: Sheet,
  load: SheetLoader = textureLoader(),
): SheetBinding {
  let bound = false;

  const texture = load(
    sheet.url,
    () => {
      bound = true;
      material.map = configureSheet(texture);
      material.color.setHex(SHEET_TINT);
      material.needsUpdate = true;
    },
    () => {
      // Said out loud, because a sheet that never arrives looks like a sheet
      // that was never bound — the ambiguity #68 records under another name.
      console.warn(`[woodwork] ${sheet.url} did not load; the surface keeps its flat colour`);
    },
  );

  return { url: sheet.url, bound: () => bound };
}

/* -------------------------------------------------------------------------- */
/*  the drawn fibre                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The relief half of the answer: fine wood fibre, **drawn in code**, tiled far
 * tighter than the photograph and bound into the slot the photograph was
 * wasting.
 *
 * ## Why drawn and not photographed
 *
 * [#284](https://github.com/mephistopheles4/stacks/issues/284) measured both.
 * Against pigment alone this fibre adds **0.742% of frame level and 1.481%
 * orbited**, where the sheet's own normal map adds **0.000%** at every rung, on
 * two different sheets. So the `normalMap` slot was holding a texture and doing
 * nothing, and this is not an extra texture — it is a better use of one.
 *
 * **The two problems are at different frequencies.** The photograph carries the
 * low-frequency figure, and it has to be laid huge for that figure not to
 * repeat — 7.68 world units, which is what caps it at 133 texels per world unit.
 * Close-up crispness is high-frequency fibre, which is the same everywhere on a
 * board and may therefore repeat every few centimetres without anybody seeing
 * it. Laid at `FIBRE_PERIOD` from a 256 canvas it supplies **512 texels per
 * world unit**, and no file size fixes the figure's ceiling because you cannot
 * invent detail that was never captured.
 *
 * ## What it costs
 *
 * One 256-square `CanvasTexture` for the whole bookcase, baked once at module
 * level — `page-edges.ts`'s pattern exactly, and for its reason: one upload for
 * a shelf of any size. **Zero bytes on the wire**, because there is no file.
 *
 * ## The seam, which the prototype had and this does not
 *
 * The bake is judged on renders and the height field is arithmetic, which is how
 * `page-edges.ts` and its spec already divide. Splitting them here paid for
 * itself immediately: `prototype/284-woodwork-channels` wraps its lattice at
 * `round(EDGE / spacing)` cells of the spacing it was *asked* for, so its
 * coarsest octave repeats every **264** texels across a **256** tile and the map
 * does not tile. The fix is to keep the cell *count* and let the spacing land
 * where it must — 23.3 texels rather than 24, a 3% move nobody can see, against
 * a discontinuity down every tile boundary that anybody could. It is
 * `page-edges.ts`'s own wrap defect, in two dimensions, found the same way.
 */

/**
 * World units one tile of the fibre covers.
 *
 * ⚠️ **A constant, and deliberately not a knob.**
 * [#284](https://github.com/mephistopheles4/stacks/issues/284) notes that 0.3
 * would make the fibre pixel-sharp at the camera's clamp and records it
 * explicitly as *"a lead rather than a recommendation"* — it was never rendered
 * after the noise fix. A number nobody has looked at does not become a control.
 * The knob is `materials.woodFibre`, which is `normalScale` and nothing else.
 */
export const FIBRE_PERIOD = 0.5;

/**
 * How many fibre tiles fit one tile of a given sheet.
 *
 * `worldSpaceUvs` has already divided every face's UVs by that sheet's
 * `unitsPerTile`, so this `repeat` converts them into the fibre's own, much
 * tighter period out of **one set of UVs and with no second file** — the figure
 * stays laid huge and the fibre is laid fine. Derived rather than written down,
 * because the sheet's world size is a property of the sheet — and it is
 * per-sheet because the two sheets are not the same size: 7.68 units against
 * 6.37, so one constant would lay the backboard's fibre 20% wrong.
 */
export function fibreTiles(sheet: SheetLay): number {
  return sheet.unitsPerTile / FIBRE_PERIOD;
}

/** The woodwork's, named because two specs and `bakeFibre` all want it. */
export const FIBRE_TILES = fibreTiles(WOODWORK_SHEET);

/**
 * The quarter turn the drawn fibre needs to run **with** a sheet's figure rather
 * than across it.
 *
 * The fibre is drawn long on the texture's own `v` (`LATTICE.along`), and
 * `worldSpaceUvs` puts the member's grain on `v` for a `v`-figured sheet and on
 * `u` for a `u`-figured one. So the turn is exactly `figure === 'u'`, read off
 * the same field the swap is — one fact about the image, deciding both.
 *
 * ⚠️ **A UV swap turns the figure and the fibre together, so it cannot separate
 * them.** That is why this is a rotation on the fibre's *own* texture matrix and
 * not another axis exchange, and it is why
 * [#297](https://github.com/mephistopheles4/stacks/issues/297) shipped a whole
 * arm matrix with the two crossed at 90° and no number said so: it took a 3×
 * crop of bare backboard to see it as ruled lines over a vertical grain. Turning
 * it is worth **2.098% of frame at zoom 10** against the fibre's whole presence
 * at 0.704% — three to six times its own existence.
 *
 * A rotation costs no bytes and no texture: a 90° turn about the tile's centre
 * maps the unit lattice onto itself, so a map that tiled still tiles.
 */
export function fibreTurn(sheet: SheetLay): number {
  return sheet.figure === 'u' ? Math.PI / 2 : 0;
}

/**
 * Lay one fibre texture for one sheet: its period, and its turn.
 *
 * Separated from the bake so a spec can drive it with a bare `THREE.Texture` —
 * `bakeFibre` needs a 2D canvas and this Vitest project has no DOM, which is
 * `applyWoodFibre`'s reason for taking its map as a parameter too.
 */
export function layFibre<T extends THREE.Texture>(texture: T, sheet: SheetLay): T {
  const tiles = fibreTiles(sheet);
  texture.repeat.set(tiles, tiles);
  texture.center.set(0.5, 0.5);
  texture.rotation = fibreTurn(sheet);
  return texture;
}

/** Square, and small: the fibre is high-frequency, so it needs period, not extent. */
const FIBRE_EDGE = 256;

/**
 * How hard the fibre pushes the normal, before `normalScale`.
 *
 * ⚠️ **The prototype's first draft multiplied the slope by the texture's edge,
 * and what that looked like was hard vertical bars in blocks.** Two mistakes,
 * both worth naming because either alone still reads as "a texture" from across
 * the room. The noise was never interpolated — a fresh value per texel, held
 * constant in bands — and a normal map is the *derivative* of its height field,
 * so every texel pointed somewhere unrelated to its neighbour. And the gain was
 * 256 times too large, which drove nearly every texel to the edge of the
 * hemisphere and left the map two colours.
 *
 * Gentle on purpose: the point is a board that stops reading as a photograph
 * pinned to a plank, not a carved one, and `normalScale` is where strength gets
 * dialled live.
 */
const RELIEF = 1.6;

/**
 * How much of that gain each axis takes — **a fifth along the grain**.
 *
 * A fibre is long, so its slope along `v` is genuinely small; encoding the two
 * axes level would read as noise rather than as grain. This is the one place the
 * anisotropy of the *encoding* lives, as against the anisotropy of the lattice
 * below, and they compound.
 */
const RELIEF_ACROSS = 0.05;
const RELIEF_ALONG = 0.01;

/**
 * The fibre's shape, as the lattice spacing in texels at `FIBRE_EDGE`.
 *
 * Wildly anisotropic, because that is what a fibre *is* — a few texels across
 * the grain against most of the tile along it. Three octaves, each half the
 * spacing of the last.
 *
 * ⚠️ **Across is `u` and along is `v`, and that pairing is load-bearing.** It is
 * what makes `fibreTurn` the sheet's own `figure === 'u'` and nothing else: on a
 * `v`-figured sheet `worldSpaceUvs` puts the member's grain on `v` and the fibre
 * already agrees, and on a `u`-figured one it does not and the map is turned.
 * A fibre laid the other way is bound at 90° to the figure it sits on — which is
 * what [#297](https://github.com/mephistopheles4/stacks/issues/297) shipped, and
 * every whole-frame number it measured sat in the normal range.
 */
const LATTICE = { across: 24, along: 192 } as const;
const OCTAVES = 3;

/**
 * FNV-1a on two integers, squashed to 0..1.
 *
 * `hash.ts`'s constants over a pair of numbers rather than over a string, so a
 * rebuild redraws the same board — `page-edges.ts`'s determinism rule, and
 * `heightFor`'s.
 */
function latticeNoise(x: number, y: number): number {
  let hash = 0x811c9dc5;
  for (const value of [x, y]) {
    for (let byte = 0; byte < 4; byte += 1) {
      hash ^= (value >>> (byte * 8)) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return (hash >>> 8) / 0x1000000;
}

/** Hermite ease, so the lattice's corners do not show as creases. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * How many lattice cells one tile is cut into, for a wanted spacing in texels.
 *
 * ⚠️ **The count is what is exact and the spacing is what gives**, which is the
 * whole of the seam fix above. A lattice of `n` cells per tile wraps on the tile
 * by construction, whatever `n` is; a lattice of a fixed *spacing* only wraps
 * when that spacing happens to divide the tile, and none of these six does.
 */
function latticeCells(spacing: number): number {
  return Math.max(1, Math.round(FIBRE_EDGE / Math.max(2, spacing)));
}

/**
 * Value noise on a wrapping lattice, with the two axes on different counts.
 *
 * `u` and `v` are tile fractions, not texels, so nothing here knows what
 * resolution it will be baked at — which is what lets a spec sample the surface
 * at 32 and get the same surface the page bakes at 256.
 */
function valueNoise(u: number, v: number, acrossCells: number, alongCells: number): number {
  const gu = u * acrossCells;
  const gv = v * alongCells;
  const u0 = Math.floor(gu);
  const v0 = Math.floor(gv);
  const fu = smooth(gu - u0);
  const fv = smooth(gv - v0);

  const at = (iu: number, iv: number): number =>
    latticeNoise(
      ((iu % acrossCells) + acrossCells) % acrossCells,
      ((iv % alongCells) + alongCells) % alongCells,
    );

  const near = at(u0, v0) * (1 - fu) + at(u0 + 1, v0) * fu;
  const far = at(u0, v0 + 1) * (1 - fu) + at(u0 + 1, v0 + 1) * fu;
  return near * (1 - fv) + far * fv;
}

/**
 * The fibre's height at a point on the tile — three octaves of the lattice
 * above, each half the spacing and half the weight.
 *
 * Periodic in both axes with period 1, deterministic, and pure. Normalised to
 * `0..1` by the weight sum so the octave count can move without changing how
 * hard the relief reads.
 */
export function fibreHeight(u: number, v: number): number {
  let total = 0;
  let weight = 0;

  for (let octave = 0; octave < OCTAVES; octave += 1) {
    const scale = 2 ** octave;
    const amplitude = 1 / scale;
    total +=
      valueNoise(u, v, latticeCells(LATTICE.across / scale), latticeCells(LATTICE.along / scale)) *
      amplitude;
    weight += amplitude;
  }

  return total / weight;
}

/**
 * The height field, one sample per texel, **in canvas row order**.
 *
 * ⚠️ **Row 0 is `v = 1`, not `v = 0`.** `CanvasTexture` defaults to `flipY`, so
 * the canvas's rows run down the image while the texture's `v` runs up it.
 * Sampling `v` backwards here is what keeps `fibreNormals`' green channel
 * pointing the way the shader will read it, and it is written as a coordinate
 * rather than as a sign on a difference because a sign is a coin toss nobody can
 * check — #297 is what an orientation nobody checked costs.
 */
export function fibreHeightField(edge: number = FIBRE_EDGE): Float32Array {
  const field = new Float32Array(edge * edge);

  for (let row = 0; row < edge; row += 1) {
    const v = 1 - (row + 0.5) / edge;
    for (let col = 0; col < edge; col += 1) {
      field[row * edge + col] = fibreHeight((col + 0.5) / edge, v);
    }
  }

  return field;
}

/**
 * The unit surface normal at every texel, three floats each, in the same order.
 *
 * A height field's normal is `normalize(-dh/du, -dh/dv, 1)`, and the derivatives
 * are plain wrapping central differences — **exact** rather than approximate at
 * the tile boundary, because `latticeCells` makes the field genuinely periodic.
 *
 * ⚠️ **No factor of the texture's own size.** The difference between two texels
 * is `dh/du` divided by `edge`, so multiplying it back by `edge` is what makes
 * this resolution-independent — and *not* dividing it out is exactly the 256×
 * gain that turned the prototype's first draft into two colours.
 */
export function fibreNormals(height: Float32Array, edge: number = FIBRE_EDGE): Float32Array {
  const normals = new Float32Array(edge * edge * 3);
  const wrap = (index: number): number => ((index % edge) + edge) % edge;
  const at = (row: number, col: number): number => height[wrap(row) * edge + wrap(col)] ?? 0;

  for (let row = 0; row < edge; row += 1) {
    for (let col = 0; col < edge; col += 1) {
      const du = ((at(row, col + 1) - at(row, col - 1)) / 2) * edge;
      // The row above is the *larger* `v`, per `fibreHeightField`'s flip.
      const dv = ((at(row - 1, col) - at(row + 1, col)) / 2) * edge;

      const nx = -du * RELIEF * RELIEF_ACROSS;
      const ny = -dv * RELIEF * RELIEF_ALONG;
      const length = Math.hypot(nx, ny, 1);

      const offset = (row * edge + col) * 3;
      normals[offset] = nx / length;
      normals[offset + 1] = ny / length;
      normals[offset + 2] = 1 / length;
    }
  }

  return normals;
}

/**
 * The one fibre map, for the life of the page.
 *
 * Module-level like `pageStriationMap`'s and the spine profile's, and for their
 * reason — the whole claim of this effect is that a bookcase of any size uploads
 * one of these, so a per-mount cache would give that away on the first rebuild.
 * Never freed by `mountShelf`'s traverse, which touches `map` and not
 * `normalMap`.
 */
let fibre: THREE.CanvasTexture | undefined;
let fibreBuilt = false;

export function woodFibreMap(): THREE.CanvasTexture | undefined {
  if (!fibreBuilt) {
    fibreBuilt = true;
    fibre = bakeFibre();
  }
  return fibre;
}

/**
 * The same fibre, laid for a sheet that is not the woodwork's default: its own
 * period, and its own turn.
 *
 * ⚠️ **A clone, because `repeat` and `rotation` live on the texture and the
 * woodwork is already wearing this one.** Setting them on the shared instance
 * would silently re-lay the *planks'* fibre at another surface's period and turn
 * it off their grain — the treatment #302 and #303 were judged at, changed by a
 * surface that has nothing to do with them.
 *
 * ⚠️ **A clone is +0 textures**, because three.js clones share the canvas
 * through the `Source` and the two are one GPU upload. #297 measured that off
 * `renderer.info.memory.textures` rather than trusting the sentence.
 *
 * ⚠️ **Keyed by the lay and not by the surface**, which is what the species menu
 * makes necessary. `bakeFibre` lays the base for `WOODWORK_SHEET`, so a shelf
 * showing sapele — 1.6 world units against rosewood's 7.68 — would wear a fibre
 * tiled **4.8× wrong** if it took the base unchanged, and no whole-frame number
 * would say so. Two sheets that lay the same share one entry, which is the
 * cache doing the arithmetic rather than a list of surfaces doing it.
 *
 * Cached like the bake it clones, for the bake's reason: one page, one of these
 * per distinct lay.
 */
const laidFibres = new Map<string, THREE.CanvasTexture>();

export function fibreMapFor(sheet: SheetLay): THREE.CanvasTexture | undefined {
  const base = woodFibreMap();
  // The base is already laid for the woodwork's default, so an identical lay
  // wants the instance itself: a clone here would be a second texture object for
  // no reason, and #303's "one bake, one upload" claim reads better if the
  // common path is literally the same object.
  if (base === undefined || sameLay(sheet, WOODWORK_SHEET)) return base;

  const key = `${String(sheet.unitsPerTile)}:${sheet.figure}`;
  const cached = laidFibres.get(key);
  if (cached !== undefined) return cached;

  const own = base.clone();
  own.needsUpdate = true;
  const laid = layFibre(own, sheet);
  laidFibres.set(key, laid);
  return laid;
}

/** Two sheets lay the same when they tile the same and turn the same. */
function sameLay(a: SheetLay, b: SheetLay): boolean {
  return a.unitsPerTile === b.unitsPerTile && a.figure === b.figure;
}

/** The backboard's, named because `scene.ts` passes it in two places. */
export function backingFibreMap(): THREE.CanvasTexture | undefined {
  return fibreMapFor(BACKBOARD_SHEET);
}

function bakeFibre(): THREE.CanvasTexture | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = FIBRE_EDGE;
  canvas.height = FIBRE_EDGE;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return undefined;

  const normals = fibreNormals(fibreHeightField());
  const image = ctx.createImageData(FIBRE_EDGE, FIBRE_EDGE);
  for (let texel = 0; texel < FIBRE_EDGE * FIBRE_EDGE; texel += 1) {
    const from = texel * 3;
    const to = texel * 4;
    image.data[to] = Math.round(((normals[from] ?? 0) * 0.5 + 0.5) * 255);
    image.data[to + 1] = Math.round(((normals[from + 1] ?? 0) * 0.5 + 0.5) * 255);
    image.data[to + 2] = Math.round(((normals[from + 2] ?? 1) * 0.5 + 0.5) * 255);
    image.data[to + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // A normal map carries geometry, not colour: it must not be sRGB-decoded.
  texture.colorSpace = THREE.NoColorSpace;
  // Laid many times across a single plank, so both axes must wrap.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = ANISOTROPY;
  return layFibre(texture, WOODWORK_SHEET);
}

/**
 * Put the fibre on the woodwork at `scale`, or take it off entirely at zero.
 * Returns the scale **actually in force**.
 *
 * ⚠️ **Zero short-circuits to no map bound at all**, not to a map scaled by
 * zero: off must cost nothing, rather than a texture unit and a `#define` on
 * every member of the case to say nothing. That is the rule `spine-profile.ts`
 * and `page-edges.ts` both follow, and it is what makes "off" honest.
 *
 * The return value is the other half of that honesty. A browser that will not
 * give a 2D context has no map to bind, and a knob reporting the scale it was
 * *asked* for would be `applySettings` claiming a change the eye cannot find —
 * the map's standing rule that **a control must not lie**.
 *
 * The map is a parameter with a real default for `bindSheet`'s reason: G21
 * (`no-live-network`) and a Vitest project with no DOM, so a spec drives this
 * with a texture it made itself.
 *
 * ⚠️ **A thunk and not a texture, which is the difference between "off binds no
 * map" and "off costs nothing".** A default parameter is evaluated whenever the
 * argument is omitted — so passing the map itself would bake a 256-square canvas
 * on every boot that has the fibre turned off, sample it 65,536 times, and throw
 * it away. Zero must not pay for the thing it turned off.
 */
export function applyWoodFibre(
  material: THREE.MeshStandardMaterial,
  scale: number,
  map: () => THREE.Texture | null = () => woodFibreMap() ?? null,
): number {
  const wanted = scale > 0 ? map() : null;
  const inForce = wanted === null ? 0 : scale;

  if (material.normalMap !== wanted) {
    // Binding or unbinding a map changes the program's defines, so without this
    // the map is uploaded and never sampled — or stays sampled after "off".
    material.normalMap = wanted;
    material.needsUpdate = true;
  }
  material.normalScale.set(inForce, inForce);

  return inForce;
}

/* -------------------------------------------------------------------------- */
/*  the per-member variation                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How far into the sheet a member's board may have been cut from, in tiles.
 *
 * A whole tile, because `RepeatWrapping` makes every offset equivalent to one
 * inside `0..1` and there is no reason to reach less of the sheet than all of
 * it.
 */
const OFFSET_SPREAD = 1;

/**
 * How far a member's own period may drift from the sheet's, per axis.
 *
 * ±9%, and **independent on `u` and `v`**, which is the point rather than an
 * oversight: one shared scale changes how big the pattern is and leaves its
 * lattice square, so two members still repeat in step. Two scales give every
 * member its own period on each axis, so no two of them line up anywhere.
 */
const SCALE_SPREAD = 0.09;

/**
 * How far a member's colour may drift, as a multiplier.
 *
 * ±10%, [#287](https://github.com/mephistopheles4/stacks/issues/287)'s number,
 * and it rides a **vertex-colour attribute** rather than a per-member
 * `THREE.Color`. That is the whole reason the variation is free: a per-member
 * colour needs a per-member *material*, which is +1 draw call each. A colour
 * attribute rides geometry every member already has its own copy of, so one
 * material still draws them all — `scene.ts`'s per-book page-block drift is the
 * same trick.
 */
const TINT_SPREAD = 0.1;

/**
 * **Runout**: how far a member's grain may tilt off its own edge, in radians.
 *
 * 0.06 rad is about **3.4°**, and small on purpose. A tree does not grow exactly
 * straight and a saw does not follow it exactly, so a sawn board's grain almost
 * never runs true to the edge — the woodworker's word is *runout*, and on a real
 * bookcase it is what stops two boards reading as one printed sheet. Beyond
 * about five degrees it stops reading as a board cut slightly off and starts
 * reading as a texture pasted on crooked, which is the failure it exists to fix.
 *
 * It also does something no offset could: rotating breaks the **column**. A tile
 * repeating up a 4.5-unit upright puts identical features directly above each
 * other and the eye finds that instantly; tilted, they drift sideways as they
 * climb and stop lining up.
 */
const RUNOUT_SPREAD = 0.06;

/**
 * Make one member's board unlike its neighbours', for **+0 textures, +0
 * materials and +0 draw calls**.
 *
 * Six boards carrying one map at one offset is one board photocopied six times,
 * which the eye reads instantly. Five differences answer it — offset, mirror,
 * per-axis scale, a ±10% tint through a vertex-colour attribute, and runout —
 * and every one of them is arithmetic on attributes the member already owns.
 *
 * ⚠️ **Call it after `worldSpaceUvs`, never before.** It transforms the UVs that
 * function wrote, so running it first would have the world-space rewrite
 * overwrite every one of the dice.
 *
 * ⚠️ **`key` carries the page's root and the member's name, and both halves are
 * load-bearing.** The root moves the whole set on the next load; the name
 * separates members within one load. A key that dropped the root would leave one
 * member fixed while the rest moved — the defect
 * [#298](https://github.com/mephistopheles4/stacks/issues/298)'s prototype
 * shipped on the backboard, which **renders correctly and only misreports**: a
 * differ comparing two seeds under-counts by one member, and the backboard is
 * 90.38% of the near frame. Build keys with `woodKeys`, which is where that is
 * asserted.
 *
 * ⚠️ **A member has no identity, and that is
 * [#287](https://github.com/mephistopheles4/stacks/issues/287)'s decision rather
 * than this file's.** The root is drawn fresh on every page load and the promise
 * is one page load only. The bottom-up ordinal and the distance-off-the-floor
 * seed were both declined, and a book-derived seed dies on arithmetic: `woodKeys`
 * names one plank per shelf **plus a lid**, and the lid never holds a book;
 * `rowsForBookcase` keeps one empty row ahead; and an empty vault gives three planks
 * and no books at all.
 */
export function varyMember(geometry: THREE.BoxGeometry, key: string): void {
  const uv = geometry.attributes['uv'];
  const position = geometry.attributes['position'];
  if (uv === undefined || position === undefined) return;

  // Draws off one hash, decorrelated by suffix — the shape `books.ts` uses for a
  // book's height and its fallback spine colour.
  const draw = (of: string): number => hashUnit(`${key}-${of}`);

  const offsetU = draw('u') * OFFSET_SPREAD;
  const offsetV = draw('v') * OFFSET_SPREAD;
  // Veneers are book-matched in life, and a flipped sheet is the cheapest way to
  // stop a tiling seam repeating identically down the case.
  const mirror = draw('mirror') < 0.5 ? -1 : 1;
  const scaleU = 1 + (draw('scale-u') - 0.5) * 2 * SCALE_SPREAD;
  const scaleV = 1 + (draw('scale-v') - 0.5) * 2 * SCALE_SPREAD;
  const runout = (draw('runout') - 0.5) * 2 * RUNOUT_SPREAD;
  const tint = 1 + (draw('tint') - 0.5) * 2 * TINT_SPREAD;

  const cos = Math.cos(runout);
  const sin = Math.sin(runout);

  for (let index = 0; index < uv.count; index += 1) {
    const u = uv.getX(index) * scaleU * mirror;
    const v = uv.getY(index) * scaleV;
    // Rotated about the UV origin. Wrapping is `RepeatWrapping`, so the
    // translation a rotation about the origin drags along is free — it lands as
    // one more offset, which is a thing this already wanted.
    uv.setXY(index, u * cos - v * sin + offsetU, u * sin + v * cos + offsetV);
  }
  uv.needsUpdate = true;

  // ⚠️ A colour attribute is read as **linear**, unlike `material.color`, which
  // three.js decodes from sRGB. A multiplier near 1 is the same number in either
  // space, which is why this is a multiplier and not a colour.
  const colours = new Float32Array(position.count * 3);
  colours.fill(tint);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/**
 * A fresh root for one page load.
 *
 * ⚠️ **`Math.random` and not a hash of anything**, which is the point rather
 * than laziness: any derived value — the row count, the vault, the clock at
 * second resolution — is something two loads could share, and
 * [#287](https://github.com/mephistopheles4/stacks/issues/287) asked for a case
 * that is different every time you open it. Rendered to base 36 so it reads as a
 * token in a URL somebody may want to paste back.
 *
 * ⚠️ **The draw is scaled to an integer and padded, rather than sliced out of
 * the fraction's own digits.** `Math.random().toString(36).slice(2, 10)` is the
 * obvious spelling and it does not hold this function's one promise: the
 * fraction's base-36 expansion is as long as it happens to be, so `0.5` yields
 * the single character `i`, and `0` — which is in `Math.random`'s range —
 * yields the **empty string**. An empty root gives keys like `:backboard`,
 * which still render, so nothing would look wrong; and at probability 2^-53 no
 * loop of samples ever finds it, so a spec asserting non-emptiness by sampling
 * passes by luck rather than by construction. Scaling to a whole number in a
 * fixed range and padding to a fixed width makes the promise structural.
 */
export const SEED_LENGTH = 8;

/** `36 ** SEED_LENGTH`, the count of tokens this draws from. */
const SEED_SPACE = 36 ** SEED_LENGTH;

export function freshWoodSeed(): string {
  return Math.floor(Math.random() * SEED_SPACE)
    .toString(36)
    .padStart(SEED_LENGTH, '0');
}

/** Every member of the case, by the key its dice are drawn off. */
export interface WoodKeys {
  readonly backboard: string;
  readonly uprightLeft: string;
  readonly uprightRight: string;
  /**
   * One per shelf, **plus the lid** — `rowCount + 1` of them, and `buildShelf`
   * iterates this array rather than counting to `rowCount` itself. The count is
   * stated here and nowhere else.
   */
  readonly planks: readonly string[];
}

/**
 * Every member's key for one page load, built in one place.
 *
 * ⚠️ **This exists so the backboard's root can be asserted, and that is
 * structural rather than tidy.** Assembled at the call sites, the keys would
 * live in `scene.ts` — which needs a WebGL context, sits outside every mutation
 * scope, and is exactly where the prototype's `varyMember(backGeometry,
 * 'backboard', …)` dropped the root and nothing noticed. A defect that *renders
 * correctly and only misreports* needs an assertion, and an assertion needs a
 * seam.
 *
 * `${root}:${member}` — the root moves the whole set on the next load, the
 * member's name separates members within one load.
 */
export function woodKeys(root: string, rowCount: number): WoodKeys {
  const member = (name: string): string => `${root}:${name}`;
  return {
    backboard: member('backboard'),
    uprightLeft: member('upright-left'),
    uprightRight: member('upright-right'),
    planks: Array.from({ length: rowCount + 1 }, (_, row) => member(`plank-${String(row)}`)),
  };
}
