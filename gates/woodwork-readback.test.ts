/**
 * G54 — the configuration the shelf resolved is the configuration it reports.
 *
 * ## The row this map earned three times, all three the same failure
 *
 * Map [#280](https://github.com/mephistopheles4/stacks/issues/280) produced
 * three defects that each rendered a confident number about a configuration that
 * was never in force, and not one of them was a change anybody made:
 *
 * - **#284's resolution control.** The arm matrix built every URL as a fixed
 *   base plus a per-arm tail, so `woodRes=1024&woodRes=512` arrived and
 *   `URLSearchParams.get` returns the **first**. The arm meant to render 512
 *   rendered 1024, and the two differenced to **0.000% at every rung, worst
 *   delta 0** — a perfect zero from an instrument nobody had proved.
 * - **#298's `woodVary`.** `last()` returns `null` for an absent key and
 *   `Number(null)` is `0` rather than `NaN`, so a `Number.isFinite(raw) &&
 *   raw >= 0` guard **passed on a missing parameter** and resolved to off —
 *   against a default the same file documented as `1`. Every render that branch
 *   ever took was unvaried, including the chosen treatment's.
 * - **#297's fibre**, bound at 90° to the figure it sat on. Every whole-frame
 *   number it produced sat in the normal range; it took a 3× crop of bare
 *   backboard to see it as ruled lines across a vertical grain.
 *
 * **A query string is an assumption until something states what came out of
 * it.** Unlike the look — which #282 settled is the owner's verdict on a live
 * build and never a number — that is machine-checkable, and this is the check.
 *
 * ## Why stating and not diffing
 *
 * ⚠️ **All four of `ApplyReport`'s older categories are transitions**, and a
 * transition cannot describe a configuration that was wrong from the first
 * frame. `applied`, `needsRebuild`, `needsReload` and `refused` each answer
 * *what changed*; none of the three defects above ever changed. So the report
 * gained a fifth category that answers *what is running*, on every apply,
 * whether or not anything moved.
 *
 * ⚠️ **This asserts against shipped code, not against the render harness.** The
 * harness's own read-back convention lives on the prototype branches and never
 * merges; making it permanent is a separate ticket, and a row asserting on a
 * branch that never lands would assert on nothing.
 *
 * ## The vacuous green, and what closes it
 *
 * `describeWoodwork` is pure and lives in a module with no Three.js in it —
 * which is what lets this gate run without a WebGL context, and is also how the
 * whole row could go vacuous: **a correct read-back that nothing calls reports
 * nothing.** The last clause reads `applyLive` in `scene.ts` as text and refuses
 * a body that does not call it and push both of its lists, which is G51's own
 * closing move one file over.
 *
 * See docs/gates.md, row G54 (woodwork-readback), and
 * [#306](https://github.com/mephistopheles4/stacks/issues/306).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../packages/site/src/shelf/shelf-settings.ts';
import {
  DEFAULT_SPECIES,
  WOODWORK_SHEET,
  WOOD_SPECIES,
  describeWoodwork,
  resolveWoodwork,
  type WoodSpecies,
} from '../packages/site/src/shelf/woodwork.ts';
import { codeOf, expectFound } from './repo.ts';

/** The settled case: a shelf built with what it was asked for, fibre as asked. */
function stated(species: WoodSpecies, fibre = DEFAULT_SETTINGS.materials.woodFibre): string {
  return describeWoodwork(resolveWoodwork(species), species, fibre, fibre).resolved.join(' | ');
}

describe('G54 — the report names the whole resolved configuration, every time', () => {
  it('states both knobs on an apply that changed nothing', () => {
    // ⚠️ **The count is the assertion, not the search.** A partial report is
    // precisely what let `woodVary` hide for a branch's worth of renders: a knob
    // dropped from this list is a knob nothing states, which is the condition
    // all three defects above rendered under. Searching for two strings would
    // stay green when a third knob arrived unstated.
    const { resolved } = describeWoodwork(
      resolveWoodwork(DEFAULT_SPECIES),
      DEFAULT_SPECIES,
      DEFAULT_SETTINGS.materials.woodFibre,
      DEFAULT_SETTINGS.materials.woodFibre,
    );

    expect(
      expectFound(resolved, 'read-back lines'),
      'lines the woodwork read-back states. Both knobs, on every apply — this is a ' +
        '*state* and not a transition, so an apply that changed nothing still says what ' +
        `the shelf is running: ${resolved.join(' | ')}`,
    ).toHaveLength(2);
  });

  it('names the species it resolved, for every entry on the roster', () => {
    // ⚠️ **Anchored to the position the code writes it in, never searched for
    // anywhere in the line** — and that distinction is the whole clause. A bare
    // `includes(name)` passes for a reason that is not the guarantee: `rosewood`
    // and `sapele` both appear inside their own sheet **URL**, and `flat` appears
    // inside `flat`'s own description, *the mean-matched flat twin*. Measured
    // rather than reasoned: with `${wanted.species}` deleted from the line
    // entirely, all twelve clauses in this file stayed green.
    //
    // That is #312's `freshWoodSeed` defect in another shape — a spec asserting
    // a property the code does not guarantee and passing on something else — and
    // it is the same family as the three read-back defects this row exists for.
    // Anchoring is what makes the assertion about the species rather than about
    // the string happening to contain those letters somewhere.
    const silent = WOOD_SPECIES.filter(
      (name) => !stated(name).startsWith(`woodwork sheet: ${name} (`),
    );

    expect(
      silent,
      'species the read-back does not name in its own slot. The name must lead the line, ' +
        'because every sheet URL already contains its own species name and `flat`’s ' +
        `description contains the word flat: ${silent.join(', ')}`,
    ).toEqual([]);
  });

  it('names the sheet it resolved, or says plainly that it bound none', () => {
    // A read-back naming a file the page did not fetch is worse than silence,
    // so `flat` says *no map* rather than borrowing the default's URL.
    expect(stated('rosewood')).toContain(WOODWORK_SHEET.url);
    expect(stated('flat')).toContain('no map');
    expect(stated('flat')).not.toContain('.jpg');
  });

  it('names the world size it laid the sheet at', () => {
    // ⚠️ **The half no whole-frame number sees.** #297's crossed fibre passed
    // every whole-frame count, and a lay 4.8× off looks entirely plausible on
    // one — rosewood's 7.68 world units against sapele's 1.6. Species and
    // resolution are coupled, so the lay is the fact that makes the pair legible
    // at a glance rather than on a 3× crop.
    expect(stated('rosewood')).toContain(String(WOODWORK_SHEET.unitsPerTile));
    expect(stated('sapele')).toContain(String(resolveWoodwork('sapele').lay.unitsPerTile));
  });

  it('names the fibre scale in force, and not the one that was asked for', () => {
    // A browser that will not give a 2D context has no map to bind, so
    // `applyWoodFibre` returns the scale that really took. A report echoing the
    // request would be a slider that moved while the bookcase did not — the
    // exact failure the whole report type exists to prevent.
    const { resolved } = describeWoodwork(
      resolveWoodwork(DEFAULT_SPECIES),
      DEFAULT_SPECIES,
      0,
      1.5,
    );
    const line = resolved.join(' | ');

    expect(line).toContain('wood fibre: 0');
    expect(
      line,
      'the request must survive beside the value in force, or the report cannot be read',
    ).toContain('1.5');
  });

  it('says nothing about a mismatch when the fibre took as asked', () => {
    // The other direction, so `asked for` cannot become noise on every apply —
    // a caveat that is always present is a caveat nobody reads.
    expect(stated(DEFAULT_SPECIES, 1.5)).not.toContain('asked for');
  });

  it('names both halves while a species change waits on a rebuild', () => {
    // `worldSpaceUvs` writes each member's world-space period into its UVs in
    // place, so a sheet laid at a different world size is new geometry and there
    // is no live path. Between setting the menu and pressing rebuild the shelf
    // is running one species and configured for another; naming one of them
    // would be the report agreeing with whichever half the reader guessed.
    const line = describeWoodwork(resolveWoodwork('sapele'), 'rosewood', 0.5, 0.5).resolved.join(
      ' | ',
    );

    // Both anchored, for the clause above's reason: a bare `toContain('sapele')`
    // is satisfied by the sheet URL and would hold with the wanted species
    // dropped, and `rosewood` has to be the *built* one rather than any mention.
    expect(line).toContain('woodwork sheet: sapele (');
    expect(line).toContain('built with rosewood');
    expect(line).toContain('rebuild');
  });
});

describe('G54 — an unrecognised species is refused out loud, never silently defaulted', () => {
  it('puts a refusal in the report and still renders the default', () => {
    // ⚠️ **Refused at resolution rather than dropped at parse.**
    // `cover_source`'s rule in the frontmatter contract drops an unrecognised
    // value, which is right for a note nobody is watching; a control somebody
    // just moved is the opposite case, because a dropped value looks exactly
    // like a value that was applied.
    const { refused, resolved } = describeWoodwork(
      resolveWoodwork('walnut'),
      DEFAULT_SPECIES,
      0.5,
      0.5,
    );

    expect(
      refused,
      'refusals for a species nobody has rendered. Silence here is a `?tune=` typo showing ' +
        'the default shelf and claiming it was applied',
    ).toHaveLength(1);
    expect(refused[0], 'the refusal must name what was asked for').toContain('walnut');
    // And the two halves of the report agree: the read-back names what is
    // actually showing, which is the fallback.
    expect(resolved.join(' | ')).toContain(DEFAULT_SPECIES);
  });

  it('refuses the inherited keys an `in` check would have accepted', () => {
    // `requested in SHEETS` answers `true` for `toString`, `constructor` and
    // every other inherited key. A guard that passes on a value nobody wrote
    // resolves to *something*, silently.
    const accepted = ['__proto__', 'toString', 'constructor', 'hasOwnProperty'].filter(
      (key) =>
        describeWoodwork(resolveWoodwork(key), DEFAULT_SPECIES, 0.5, 0.5).refused.length === 0,
    );

    expect(
      accepted,
      `inherited object keys accepted as species names: ${accepted.join(', ')}`,
    ).toEqual([]);
  });

  it('refuses nothing for a species that did resolve', () => {
    // The positive control. Every clause above is satisfied by a function that
    // refuses everything, which would be a report saying the shelf is broken on
    // every load — and a refusal that is always present is a refusal nobody
    // reads, which is the same defect wearing the opposite sign.
    const noisy = WOOD_SPECIES.filter(
      (name) => describeWoodwork(resolveWoodwork(name), name, 0.5, 0.5).refused.length > 0,
    );

    expect(noisy, `roster species the report refuses anyway: ${noisy.join(', ')}`).toEqual([]);
  });
});

describe('G54 — the shelf actually consumes the read-back', () => {
  it('calls `describeWoodwork` in `applyLive` and pushes both of its lists', () => {
    // ⚠️ **The vacuous green this row would otherwise have.** Everything above
    // is arithmetic on a pure module and would stay green if `scene.ts` never
    // called it — a correct read-back that nothing consumes reports nothing, and
    // the report is the whole point. G51 closes the same hole the same way, on
    // the same file.
    //
    // Comments are blanked by `codeOf` first: this file's own prose names every
    // identifier below, and so does `applyLive`'s.
    const source = codeOf('packages/site/src/shelf/scene.ts');
    const body = /function applyLive\([\s\S]*?\n}/.exec(source)?.[0] ?? '';

    expectFound(
      [body].filter((text) => text.length > 0),
      'the body of `applyLive`',
    );

    expect(
      body.includes('describeWoodwork('),
      '`applyLive` must call `describeWoodwork`. Without it the read-back is a pure ' +
        'function nothing runs, and the report goes back to being four transitions that ' +
        'cannot describe a configuration wrong from the first frame',
    ).toBe(true);

    // Both lists, because either alone is half a report: the state without the
    // refusal is a shelf that never says it could not honour a request, and the
    // refusal without the state is #284's perfect zero all over again.
    for (const list of ['resolved', 'refused']) {
      expect(
        new RegExp(`${list}\\.push\\(\\s*\\.\\.\\.`).test(body),
        `\`applyLive\` must spread the read-back's \`${list}\` into the report`,
      ).toBe(true);
    }
  });

  it('states the read-back on the `ApplyReport` the panel renders', () => {
    // The last link in the chain: a category the type carries and the panel
    // drops is a read-back nobody can see. The panel is what the owner actually
    // looks at, so a report field it never renders is the same silence.
    const scene = codeOf('packages/site/src/shelf/scene.ts');
    const panel = codeOf('packages/site/src/shelf/debug-panel.ts');

    expect(
      /readonly resolved:\s*readonly string\[\]/.test(scene),
      '`ApplyReport` must carry the `resolved` list',
    ).toBe(true);
    expect(
      panel.includes('report.resolved'),
      'the debug panel must render `report.resolved`, or the read-back reaches nobody',
    ).toBe(true);
  });
});
