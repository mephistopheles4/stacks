/**
 * Throwaway spike for #487: what Tweakpane 4.0.5 actually does at the seams the
 * tuning panel's honesty behaviours depend on. Never merged; nothing gates it.
 *
 *   node spikes/487-tweakpane-honesty/spike.mjs
 *
 * Loads the installed `tweakpane` bundle into headless Chrome (puppeteer-core,
 * the Chrome `smoke:render` finds) and prints one JSON object per probe.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(new URL('../../packages/site/package.json', import.meta.url));
const tweakpane = readFileSync(require.resolve('tweakpane'), 'utf8');

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((path) => existsSync(path));
if (chrome === undefined) throw new Error('no Chrome found');

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.addScriptTag({
    type: 'module',
    content: `${tweakpane}\nwindow.TP = { Pane, VERSION };`,
  });
  await page.waitForFunction(() => window.TP !== undefined);

  const results = await page.evaluate(() => {
    const { Pane } = window.TP;
    const out = {};
    const pane = new Pane({ title: 'spike', expanded: false });
    document.body.append(pane.element);
    out.collapsed = {
      expandedProp: pane.expanded,
      rootClass: pane.element.className,
    };

    /* A. A list binding holding a value its options do not offer (#300). */
    {
      const obj = { sheet: 'walnut' };
      const seen = [];
      const b = pane.addBinding(obj, 'sheet', {
        options: { rosewood: 'rosewood', sapele: 'sapele', flat: 'flat' },
      });
      b.on('change', (ev) => seen.push(ev.value));
      const select = b.element.querySelector('select');
      const before = { selectedIndex: select.selectedIndex, obj: obj.sheet, seen: [...seen] };
      pane.refresh();
      out.listStray = {
        before,
        afterRefresh: { selectedIndex: select.selectedIndex, obj: obj.sheet, seen: [...seen] },
        hasOptionsSetter: 'options' in b,
        optionElemsDisabled: [...select.options].map((o) => o.disabled),
      };
    }

    /* B. The same, with the stray offered through the public `options` setter. */
    {
      const obj = { sheet: 'walnut' };
      const seen = [];
      const b = pane.addBinding(obj, 'sheet', {
        options: { rosewood: 'rosewood', sapele: 'sapele', flat: 'flat' },
      });
      b.options = [
        { text: 'rosewood', value: 'rosewood' },
        { text: 'sapele', value: 'sapele' },
        { text: 'flat', value: 'flat' },
        { text: 'walnut — not on the list', value: 'walnut' },
      ];
      b.on('change', (ev) => seen.push(ev.value));
      const select = b.element.querySelector('select');
      pane.refresh();
      const afterRefresh = {
        selectedIndex: select.selectedIndex,
        shown: select.options[select.selectedIndex]?.textContent,
        obj: obj.sheet,
        seen: [...seen],
      };
      // A person picks rosewood.
      select.selectedIndex = 0;
      select.dispatchEvent(new Event('change'));
      b.options = [
        { text: 'rosewood', value: 'rosewood' },
        { text: 'sapele', value: 'sapele' },
        { text: 'flat', value: 'flat' },
      ];
      out.listStrayViaOptions = {
        afterRefresh,
        afterPick: { obj: obj.sheet, seen: [...seen], optionCount: select.options.length },
      };
    }

    /* C. A slider whose value is outside its range, or off its step. */
    {
      const obj = { range: 20, step: 0.03 };
      const seen = [];
      const r = pane.addBinding(obj, 'range', { min: 0, max: 8, step: 0.05 });
      const s = pane.addBinding(obj, 'step', { min: 0, max: 1, step: 0.05 });
      r.on('change', (ev) => seen.push(['range', ev.value]));
      s.on('change', (ev) => seen.push(['step', ev.value]));
      const before = { ...obj };
      pane.refresh();
      out.sliderConstraint = { before, afterRefresh: { ...obj }, seen };
    }

    /* D. Does refresh() after a programmatic write fire the change handler? */
    {
      const obj = { v: 1 };
      const seen = [];
      const b = pane.addBinding(obj, 'v', { min: 0, max: 8, step: 0.01 });
      b.on('change', (ev) => seen.push({ value: ev.value, last: ev.last }));
      obj.v = 2;
      pane.refresh();
      obj.v = 2;
      pane.refresh();
      out.refreshEcho = { seen };
    }

    /* E. Disabled with a visible reason in a multi-line label. */
    {
      const obj = { exposure: 1 };
      const b = pane.addBinding(obj, 'exposure', { min: 0.1, max: 3, step: 0.01 });
      b.disabled = true;
      b.label = 'exposure\npick a tone mapping first';
      pane.expanded = true;
      const labelElem = b.element.querySelector('.tp-lblv_l');
      out.disabledReason = {
        rowClass: b.element.className,
        labelHtml: labelElem.innerHTML,
        pointerEvents: getComputedStyle(b.element).pointerEvents,
        inputDisabled: b.element.querySelector('input').disabled,
      };
      pane.expanded = false;
    }

    /* F. A lamp and class label carried in the label text. */
    {
      const obj = { intensity: 2.7 };
      const b = pane.addBinding(obj, 'intensity', { min: 0, max: 8, step: 0.05 });
      b.label = '🟢 intensity · live';
      const first = b.element.querySelector('.tp-lblv_l').textContent;
      b.label = '🟠 intensity · rebuild';
      out.lampInLabel = { first, second: b.element.querySelector('.tp-lblv_l').textContent };
    }

    /* G. A number-valued colour round-trips, and refresh does not echo. */
    {
      const obj = { colour: 0x8a5a3c };
      const seen = [];
      const b = pane.addBinding(obj, 'colour', { view: 'color' });
      b.on('change', (ev) => seen.push(ev.value));
      pane.refresh();
      out.colour = { obj: obj.colour.toString(16), seen };
    }

    /* H. A monitor with interval 0 only moves on refresh(); a multiline one shows one value. */
    {
      const stats = { fps: 60, status: 'line one\nline two' };
      const m = pane.addBinding(stats, 'fps', { readonly: true, interval: 0 });
      const t = pane.addBinding(stats, 'status', {
        readonly: true,
        multiline: true,
        rows: 3,
        interval: 0,
      });
      stats.fps = 30;
      stats.status = 'line three';
      const before = {
        fps: m.element.querySelector('input').value,
        status: t.element.querySelector('textarea').textContent,
      };
      pane.refresh();
      out.monitor = {
        before,
        after: {
          fps: m.element.querySelector('input').value,
          status: t.element.querySelector('textarea').textContent,
        },
      };
    }

    /* I. Buttons: hidden, and a title that can change. */
    {
      const btn = pane.addButton({ title: 'rebuild shelf to apply' });
      btn.hidden = true;
      const hiddenClass = btn.element.className;
      btn.title = 'copied';
      out.button = { hiddenClass, title: btn.element.textContent };
    }

    /* K. A disabled folder disables its children, and its title can say why. */
    {
      const folder = pane.addFolder({ title: 'shadow map' });
      const obj = { casters: true };
      const b = folder.addBinding(obj, 'casters');
      folder.disabled = true;
      folder.title = 'shadow map — off: real-time shadows are off';
      out.folderDisabled = {
        childDisabled: b.disabled,
        childRowClass: b.element.className,
        childInputDisabled: b.element.querySelector('input').disabled,
        foldButtonDisabled: folder.element.querySelector('button').disabled,
        title: folder.element.querySelector('.tp-fldv_t').textContent,
      };
    }

    /* J. Plugin registration checks only the core major version. */
    {
      const plugin = (major) => ({
        id: `spike-${major}`,
        plugin: { id: `spike-${major}`, type: 'blade', core: { major, minor: 0, patch: 0 } },
      });
      const attempt = (major) => {
        try {
          pane.registerPlugin(plugin(major));
          return 'accepted';
        } catch (error) {
          return String(error.message);
        }
      };
      out.pluginCompat = { core2: attempt(2), core3: attempt(3) };
    }

    return out;
  });

  for (const [probe, result] of Object.entries(results)) {
    console.log(JSON.stringify({ probe, result }));
  }
} finally {
  await browser.close();
}
