# The open main page

[#397](https://github.com/mephistopheles4/stacks/issues/397), built from [`docs/spec/close-the-main-page.md`](../spec/close-the-main-page.md).

`smoke:render` opens one page first, for the screenshot, G35, examining and the phone check, and never closed it until the browser closed. It kept drawing the shelf. Every browser context shares one software GPU process under SwiftShader, so every later boot and frame waited behind it. `main()` now detaches that page's listeners and closes it after `checkPhone`, before `checkSpread`. No gate row, settle, absence wait or case order changed.

## The probe (spec §S10)

Four serial cold boots, new contexts, `CI=true`, Chrome pinned to 4 cores:

| Main page | Ready, per boot | Settle, per boot | 4 boots, wall |
| --- | --- | --- | --- |
| left open | 13.1–13.9 s | ~4.0 s | 129.6 s |
| closed | 0.7 s | ~2.2 s | 32.0 s |

## The first CI run failed, and why is not known

The first push of the branch went red at `smoke:render`: `page.close()` threw `Protocol error (Target.closeTarget): No target with given id found`, 62 s after the site build. It had never happened locally. The second commit swallows that one message and rethrows any other, and prints `main page: close() found no target, cause not established (#397)` when it does. **The cause is not established.** In puppeteer-core 25.13.0 `close()` sends the cached id of the page's target, so the error shows the id was unknown, not that the page closed; a page still open and drawing would cost the saving this change is for. Nothing else in the gate detects that. If C5 misses, look for that line in the run's log first. To establish it: rerun the first commit's job, log the browser's target events and `page.isClosed()` beside the close, and try the first commit without `removeAllListeners()`.

## C6, the spec's claim that G60's time to ready per boot halves: same machine, base against change

Full `CI=true pnpm smoke:render`, 32 cores, no pinning, one run each. The change run was made on the tree of the first commit, before the catch was added; the catch acts only when the close throws, so the success path is the same. Check lines match apart from frame and colour counts.

| Step | Base | Change |
| --- | --- | --- |
| `visit()` boots (12), to ready | 44.6 s | 11.9 s |
| `visit()` boots (12), to settled | 11.9 s | 9.0 s |
| G60 | 103.0 s | 45.1 s |
| G61 | 25.7 s | 11.1 s |
| open spread | 17.4 s | 14.3 s |
| G59 | 10.1 s | 7.9 s |
| G64 | 7.3 s | 3.4 s |

Time to ready per G60 boot fell from 3.7 s to 1.0 s. G61's four boots, newly timed, took 5.1 s to ready and 2.1 s to settled.

## C5, the spec's claim that G60 plus G61 take under 250 s, after the merge

First push run on `main` containing the merge: G60 and G61 against run 39051984873's 380.6 s and 124.7 s. The build session, or the lead that started it, adds the times here. At or over 505 s, or a red `main`, the reader opens the revert pull request; under 505 s but at or over 250 s, nothing is reverted and the owner decides (spec S6.2). Once the times are in, one issue is filed: "Should pull requests run G60 and G61 again?" (spec S9).
