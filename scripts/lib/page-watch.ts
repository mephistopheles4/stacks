/**
 * The in-page watcher behind G35's "the pages arrive hidden" clause, kept apart
 * from `scripts/smoke-render.ts` so a test can run it against a fake page and
 * show it can fail (#599).
 *
 * Watches every held page from the moment it is added: each must arrive hidden
 * by `visibility`, and no page may ever be visible while its opacity is still 0,
 * which is what text showing through the closing cover looks like in the DOM.
 * Watched rather than sampled once after the click, because on a slow runner the
 * one sample could land after the fade and prove nothing.
 *
 * **A page is added once, wherever it arrives.** Each page is wrapped in a slot
 * before it reaches the document, so the node the observer sees added is the
 * slot and the page is inside it: pages are found in an added node's subtree as
 * well as among the added nodes. The open book's pages then move between their
 * slot and a flat layer, which re-inserts the same node; that is not the page
 * appearing again. A page *first* seen while visible still fails, in a slot or
 * out of one: `page-watch.test.ts` runs each.
 */
export const WATCH_PAGES = `(() => {
  const seen = [];
  window.__pageVisibility = seen;
  const record = (page, event) => seen.push({ event, visibility: page.style.visibility, opacity: page.style.opacity });
  const known = new WeakSet();
  const see = (page) => {
    if (known.has(page)) return;
    known.add(page);
    record(page, 'added');
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        // A page arrives inside its slot, which is the node the document sees added.
        if (node.classList.contains('held-page')) see(node);
        for (const page of node.querySelectorAll('.held-page')) see(page);
      }
      const target = mutation.target;
      if (mutation.type === 'attributes' && target instanceof HTMLElement && target.classList.contains('held-page')) record(target, 'style');
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
})()`;

export const PAGES_HIDDEN = `(() => {
  const seen = window.__pageVisibility ?? [];
  const added = seen.filter((entry) => entry.event === 'added');
  return added.length >= 2 &&
    added.every((entry) => entry.visibility === 'hidden') &&
    !seen.some((entry) => entry.visibility === 'visible' && Number(entry.opacity) === 0);
})()`;
