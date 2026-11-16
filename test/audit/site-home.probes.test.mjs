// Behavior probes from the independent audit of the new home page, second half: the live demo,
// the use cases, the commands, the closing stage and the contact form. The implementer's tests
// read the components as text; these probes run the two client scripts (the demo sheet and the
// contact form) against a small model of the page, and check that no i18n key survives only in
// a comment. Each case states, as comments, the contract it protects, the plausible regression
// that breaks it and why the implementer's tests miss it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const component = (name) => readFileSync(join(ROOT, 'site', 'src', 'components', `${name}.astro`), 'utf8');
const scriptOf = (source) => /<script>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? '';
const markupOf = (source) => source.split(/<script\b/)[0];

// The value of a single-quoted string key in an i18n file.
function i18n(lang, key) {
  const text = readFileSync(join(ROOT, 'site', 'src', 'i18n', `${lang}.ts`), 'utf8');
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(text);
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}

// A tiny DOM: each element answers only the selectors the model declares, and says so when a
// script asks for one it does not know, so a refactor that renames a hook fails with a clear line.
function element(name, selectors = {}, extra = {}) {
  const el = {
    name,
    dataset: {},
    top: 0,
    bottom: 0,
    getBoundingClientRect() { return { top: el.top, bottom: el.bottom }; },
    querySelector(sel) {
      if (!(sel in selectors)) throw new Error(`probe model: ${name} does not model selector ${sel}`);
      const found = selectors[sel];
      return Array.isArray(found) ? found[0] ?? null : found;
    },
    querySelectorAll(sel) {
      if (!(sel in selectors)) throw new Error(`probe model: ${name} does not model selector ${sel}`);
      const found = selectors[sel];
      return Array.isArray(found) ? found : [found];
    },
    ...extra,
  };
  el.selectors = selectors;
  return el;
}

// ---------------------------------------------------------------------------------------------
// The demo sheet, driven by the component's own script and the real stage function.

const demoModule = await import('../../site/src/lib/demo.js');

function demoModel() {
  const source = component('LiveDemo');
  const markup = markupOf(source);
  // the conversation marks, in document order, with the stage each one brings
  const stages = [...markup.matchAll(/<li\b[^>]*\bdata-stage="(\d+)"/g)].map((m) => Number(m[1]));
  // the sheet: every element with data-since; the checkbox row is a template repeated once per
  // planned check of the spec (demoR5dod1..n in the component)
  const sheetMarkup = markup.slice(markup.indexOf('data-demo-sheet'));
  const dodStart = sheetMarkup.indexOf('demo-sheet__dod');
  const dodEnd = sheetMarkup.indexOf('</ul>', dodStart);
  const planned = new Set([...source.matchAll(/t\.demoR5dod(\d+)/g)].map((m) => m[1])).size;
  const items = [];
  const checks = [];
  for (const m of sheetMarkup.matchAll(/data-since="(\d+)"/g)) {
    const insideDod = m.index > dodStart && m.index < dodEnd;
    const copies = insideDod ? planned : 1;
    for (let i = 0; i < copies; i++) {
      const item = element(`since ${m[1]}`);
      item.dataset.since = m[1];
      items.push(item);
      if (insideDod) checks.push(item);
    }
  }
  const turns = stages.map((stage, i) => {
    const turn = element(`turn ${i}`);
    turn.dataset.stage = String(stage);
    return turn;
  });
  const sheet = element('sheet', { '[data-since]': items, '.demo-sheet__dod li': checks });
  const demo = element('demo', { '[data-demo-sheet]': sheet, '.demo-turn[data-stage]': turns });
  const listeners = {};
  const media = { matches: true, listeners: [], addEventListener(type, f) { if (type === 'change') media.listeners.push(f); } };
  const context = {
    document: element('document', { '[data-demo]': [demo] }),
    matchMedia: () => media,
    addEventListener: (type, f) => { (listeners[type] ??= []).push(f); },
    innerHeight: 900,
    Number, String, Math,
    demoStage: demoModule.demoStage,
    lastStage: demoModule.lastStage,
  };
  const code = scriptOf(source)
    .replace(/^\s*import\s*\{[^}]*\}\s*from\s*'\.\.\/lib\/demo\.js';?\s*$/m, '')
    .replace(/<HTML\w*Element>/g, '');
  // Layout in page coordinates: one mark every 300px from 400, the section ends 400px after the last.
  const layout = turns.map((_, i) => 400 + i * 300);
  const sectionEnd = layout.at(-1) + 400;
  const scrollTo = (y) => {
    turns.forEach((turn, i) => { turn.top = layout[i] - y; turn.bottom = turn.top + 120; });
    demo.top = layout[0] - 200 - y;
    demo.bottom = sectionEnd - y;
    for (const f of listeners.scroll ?? []) f();
  };
  const state = () => ({
    live: 'live' in sheet.dataset,
    arrived: items.map((item) => item.dataset.arrived ?? null),
    checked: checks.map((check) => check.dataset.checked ?? null),
  });
  return { code, context, media, items, checks, turns, stages, layout, sectionEnd, scrollTo, state, run: () => vm.runInNewContext(code, context) };
}

// Contract: on a wide screen with motion allowed, the sheet follows the conversation both ways:
// scrolling down it never takes back what arrived, scrolling up it returns to what that position
// shows, an item arrives when the conversation reaches its moment (the highest stage among the
// marks past DEMO_LINE of the viewport, or the last stage once the section's end is on screen),
// and the four boxes tick only at the last stage, never before every item has arrived.
// Breaks when: the script keeps the highest stage it saw (a ratchet, so scrolling back up leaves
// the sheet full), ticks the boxes at an earlier stage, or compares `since` the wrong way round.
// Not covered by: test/site-demo.test.mjs proves demoStage alone and reads the component as text
// (the import, the media query, no live state in the markup); the script that turns a stage into
// data-arrived and data-checked never runs there.
test('demo sheet: the component script follows the conversation down and back up, and ticks the boxes only at the last stage', () => {
  const model = demoModel();
  assert.ok(model.stages.length >= 2 && model.checks.length >= 1, `the model found marks (${model.stages}) and checks (${model.checks.length})`);
  model.run();
  const last = Math.max(...model.stages);
  const line = model.context.innerHeight * demoModule.DEMO_LINE;
  const positions = [];
  for (let y = 0; y <= model.sectionEnd + 200; y += 23) positions.push(y);
  const oracle = (y) => {
    if (model.sectionEnd - y <= model.context.innerHeight) return last;
    let stage = 1;
    model.layout.forEach((top, i) => { if (top - y < line) stage = Math.max(stage, model.stages[i]); });
    return stage;
  };
  const down = [];
  for (const y of positions) {
    model.scrollTo(y);
    const s = model.state();
    down.push(s);
    assert.ok(s.live, `live at y=${y}`);
    const stage = oracle(y);
    assert.deepEqual(s.arrived, model.items.map((item) => String(Number(item.dataset.since) <= stage)), `items at y=${y}, stage ${stage}`);
    const allArrived = s.arrived.every((a) => a === 'true');
    for (const c of s.checked) {
      assert.equal(c, String(stage >= last), `boxes at y=${y}, stage ${stage}`);
      if (c === 'true') assert.ok(allArrived, `a box ticked at y=${y} before every item arrived`);
    }
  }
  for (let i = 1; i < down.length; i++) {
    down[i - 1].arrived.forEach((a, k) => { if (a === 'true') assert.equal(down[i].arrived[k], 'true', `item ${k} went back at y=${positions[i]} while scrolling down`); });
  }
  assert.ok(down.at(-1).checked.every((c) => c === 'true'), 'past the section every box is ticked');
  assert.ok(down[0].arrived.some((a) => a === 'false'), 'at the top of the page something is still to arrive');
  for (let i = positions.length - 1; i >= 0; i--) {
    model.scrollTo(positions[i]);
    assert.deepEqual(model.state(), down[i], `scrolling back up to y=${positions[i]} shows what scrolling down showed`);
  }
});

// Contract: on a narrow screen or with reduced motion the sheet carries no live state, so it shows
// ready (decisions 6 and 7 of the spec); leaving the wide, motion-allowed state clears every mark
// the script had set, and entering it again brings them back.
// Breaks when: the script clears data-live but leaves data-arrived="false" or data-checked="false"
// behind (the dim rules are scoped under [data-live] today, but the state that stays lies about
// the sheet and any rule written without the scope hides content), or never listens to the change.
// Not covered by: test/site-demo.test.mjs only checks that the media query string is in the file.
test('demo sheet: outside the wide, motion-allowed state the script leaves no live state behind', () => {
  const model = demoModel();
  model.media.matches = false;
  model.run();
  model.scrollTo(0);
  assert.deepEqual(model.state(), { live: false, arrived: model.items.map(() => null), checked: model.checks.map(() => null) }, 'ready from the start');
  model.media.matches = true;
  for (const f of model.media.listeners) f();
  model.scrollTo(0);
  assert.ok(model.state().live, 'the change to a wide screen turns the sheet live');
  model.media.matches = false;
  assert.ok(model.media.listeners.length >= 1, 'the script listens to the media query');
  for (const f of model.media.listeners) f();
  assert.deepEqual(model.state(), { live: false, arrived: model.items.map(() => null), checked: model.checks.map(() => null) }, 'back to ready');
});

// ---------------------------------------------------------------------------------------------
// The verdict chip of the sheet before the verdict, in the inks of both themes.

const STYLES = join(ROOT, 'site', 'src', 'styles', 'genius');

// Custom properties of the first block opening with `open` in a design system file.
function tokens(file, open) {
  const css = readFileSync(join(STYLES, file), 'utf8');
  const start = css.indexOf(open);
  assert.ok(start >= 0, `${file} has a block ${open}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

// A colour value resolved through the theme's custom properties, as [r, g, b], or null when the
// value is transparent.
function rgb(value, theme) {
  let v = value.trim();
  for (let i = 0; i < 10 && /var\(/.test(v); i++) v = v.replace(/var\((--[\w-]+)\)/g, (_, name) => theme[name] ?? name);
  if (v === 'transparent') return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  assert.ok(hex, `${value} resolves to a colour (${v})`);
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
const lum = (c) => c.map((x) => x / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
  .reduce((sum, s, i) => sum + s * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const mix = (fg, bg, alpha) => fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);

// Contract: while the sheet is live and the verdict has not arrived, the verdict chip is unfilled and
// its text stays readable on the card in both themes: the chip's own ink, under the opacity the
// sheet gives to what has not arrived, against the card (or against the chip's fill if it gets one,
// under the same opacity), reads at 1.8:1 or more, the floor the orchestrator set for the dimmed sheet.
// Breaks when: the chip's dimmed ink goes back to --ink-5, the dim ink of before the fix: under the
// 0.45 opacity it reads 1.33:1 on the white card, or the opacity drops so far that the chip fades out.
// Not covered by: test/site-demo.test.mjs measures fields, checks, files and the verdict sentence,
// but not the chip, and its no-colour rule skips the chip rule, so any chip ink passes there.
test('demo sheet: the verdict chip stays readable before the verdict, in both themes', (t) => {
  const light = tokens('genius-tudo.css', ':root {');
  const themes = { light, dark: { ...light, ...tokens('genius-noite.css', ':root[data-theme="dark"]') } };
  const style = [...component('LiveDemo').matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
    decl: (prop) => new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`).exec(m[2])?.[1]?.trim() ?? null,
  }));
  const last = (test, prop) => rules.filter((r) => r.selectors.some(test) && r.decl(prop) !== null).at(-1)?.decl(prop) ?? null;
  const notArrived = (s) => /\[data-live\].*\[data-arrived="false"\]$/.test(s);
  const chipNotArrived = (s) => /\[data-live\].*\[data-arrived="false"\] \.gx-chip$/.test(s);
  const opacity = Number(last(notArrived, 'opacity') ?? 1);
  const ink = last(chipNotArrived, 'color');
  const fill = last(chipNotArrived, 'background') ?? last(chipNotArrived, 'background-color') ?? 'transparent';
  assert.ok(ink, 'the component gives the chip an ink while the verdict has not arrived');
  for (const [name, theme] of Object.entries(themes)) {
    const card = rgb(theme['--bg-sheet'] ?? '', theme);
    const chipFill = rgb(fill, theme);
    const under = chipFill ? mix(chipFill, card, opacity) : card;
    // group opacity: the text and the fill are each blended with the card at the same alpha
    const text = mix(rgb(ink, theme), card, opacity);
    const r = ratio(text, under);
    t.diagnostic(`${name}: chip before the verdict ${r.toFixed(2)}:1`);
    assert.ok(r >= 1.8, `${name}: the chip before the verdict reads ${r.toFixed(2)}:1, under 1.8:1 (ink ${ink}, opacity ${opacity})`);
  }
});

// ---------------------------------------------------------------------------------------------
// The contact form, driven by the component's own submit handler.

// Every element of the markup that has an id, as the page renders it in `lang`: its attributes
// (`{t.key}` resolved), `hidden`, its text and `focus()`, which moves the focus only to an element
// the browser would focus (a tabindex, or a link or a control).
function elementsById(markup, lang, doc) {
  const value = (raw) => {
    if (raw === undefined) return '';
    const key = /^\{\s*t\.(\w+)\s*\}$/.exec(raw)?.[1];
    return key ? i18n(lang, key) : raw.replace(/^"|"$/g, '');
  };
  const byId = {};
  for (const m of markup.matchAll(/<([a-z]+)\b([^>]*\sid="([\w-]+)"[^>]*)>/g)) {
    const [, tag, rawAttrs, id] = m;
    const attrs = {};
    for (const a of rawAttrs.matchAll(/\s([\w-]+)(?:=("[^"]*"|\{[^}]*\}))?/g)) attrs[a[1]] = value(a[2]);
    const close = markup.indexOf(`</${tag}>`, m.index + m[0].length);
    const inner = /\/>$/.test(m[0]) || close < 0 ? '' : markup.slice(m.index + m[0].length, close);
    const el = {
      tag,
      attrs,
      hidden: 'hidden' in attrs,
      textContent: inner.replace(/\{t\.(\w+)\}/g, (_, k) => i18n(lang, k)).replace(/<[^>]*>/g, '').trim(),
      dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
        .map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v])),
      focus() { if ('tabindex' in attrs || /^(a|button|input|select|textarea)$/.test(tag)) doc.activeElement = el; },
    };
    byId[id] = el;
  }
  return byId;
}

function formModel(lang) {
  const source = component('ContactForm');
  const markup = markupOf(source);
  const id = /const FORMSPREE_ID = '([^']+)'/.exec(source)?.[1];
  const action = /action=\{`([^`]+)`\}/.exec(markup)?.[1]?.replace('${FORMSPREE_ID}', id);
  const doc = { activeElement: null };
  const byId = elementsById(markup, lang, doc);
  // the button as the page renders it: its label and its data-sending value in the page's language
  const sendingKey = /data-sending=\{t\.(\w+)\}/.exec(markup)?.[1];
  const sendLabel = i18n(lang, 'contactSend');
  const button = { textContent: sendLabel, disabled: false, dataset: { sending: sendingKey ? i18n(lang, sendingKey) : undefined } };
  const handlers = {};
  // the form element is the one the markup opens with <form ... id="...">; it answers the submit
  // button and counts resets, because a failed send must keep what the visitor typed
  const formId = /<form\b[^>]*\sid="([\w-]+)"/.exec(markup)?.[1];
  const form = element('form', { '.contact-submit': button }, {
    action,
    addEventListener: (type, f) => { handlers[type] = f; },
    resets: 0,
    reset() { form.resets++; },
  });
  if (formId) byId[formId] = form;
  // the success message is the element announced as a status; the error region is the other
  // element announced to screen readers (role alert or status, or aria-live other than off)
  const announced = Object.values(byId).filter((el) => el.attrs && (/^(alert|status)$/.test(el.attrs.role ?? '') || (el.attrs['aria-live'] ?? 'off') !== 'off'));
  const success = byId['form-success'];
  const errors = announced.filter((el) => el !== success);
  const body = byId['contact-body'];
  const calls = [];
  let reply;
  class FormData { constructor(f) { this.form = f; } }
  const context = {
    document: { getElementById: (x) => byId[x] ?? null, get activeElement() { return doc.activeElement; } },
    fetch: (url, init) => { calls.push({ url, init }); return new Promise((ok, fail) => { reply = { ok, fail }; }); },
    FormData,
  };
  const code = scriptOf(source).replace(/\s+as\s+HTML\w+(\s*\|\s*null)?/g, '');
  vm.runInNewContext(code, context);
  return { action, button, body, success, errors, doc, calls, handlers, FormData, sendLabel, reply: () => reply, form };
}

// Contract: the form posts by fetch to the Formspree form of today with the form's own fields and
// asks for JSON; while the request is out the button reads the sending text of the page's language
// and is disabled, and the error region is empty; a 2xx hides the form, shows the success message
// and moves the focus to it, with no error; a non-2xx answer or a network failure gives the button
// back with its label, keeps the form and what was typed, shows no success and writes contactError,
// in the page's language, into the one announced region besides the success message; sending again
// empties that region while the request is out, so the next failure is announced anew.
// Breaks when: the success and error branches swap, the handler forgets preventDefault (the page
// navigates to Formspree), the button stays disabled after a failure, the sending text or the error
// falls back to a fixed English string, the failure resets the form, the region keeps the old error
// while sending, the error region loses its role, or the focus stays on a button that was hidden.
// Not covered by: test/site-demo.test.mjs runs the same script for the error and the focus, but
// never checks preventDefault, the method, the body or the Accept header of the request, nor the
// sending text while it is out (its handler gets a preventDefault that records nothing).
test('contact form: the submit handler sends by fetch and shows the outcome of each answer', async () => {
  for (const [lang, outcome] of ['en', 'pt-br'].flatMap((l) => ['ok', 'http error', 'network error'].map((o) => [l, o]))) {
    const m = formModel(lang);
    assert.equal(m.action, 'https://formspree.io/f/xgonvawy', 'the form posts to the Formspree form of today');
    assert.equal(typeof m.handlers.submit, 'function', 'the script handles submit');
    assert.equal(m.errors.length, 1, `${lang}: one announced region for the error besides the success message`);
    const [region] = m.errors;
    const shown = (el) => (el.hidden ? '' : el.textContent);
    assert.equal(shown(region), '', `${lang}: no error at rest`);
    assert.equal(m.success.hidden, true, `${lang}: no success at rest`);
    let prevented = false;
    const done = m.handlers.submit({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented, 'the native submit is prevented while the script runs');
    assert.equal(m.calls.length, 1, 'one request');
    const { url, init } = m.calls[0];
    assert.equal(url, m.action);
    assert.equal(init.method, 'POST');
    assert.ok(init.body instanceof m.FormData && init.body.form === m.form, 'the body is the form data of this form');
    assert.equal(init.headers?.Accept ?? init.headers?.accept, 'application/json');
    assert.equal(m.button.disabled, true, 'disabled while sending');
    assert.equal(m.button.textContent, i18n(lang, 'contactSending'), `${lang}: the sending text comes from the i18n of the page`);
    assert.equal(shown(region), '', `${lang}: no error while sending`);
    if (outcome === 'ok') m.reply().ok({ ok: true });
    else if (outcome === 'http error') m.reply().ok({ ok: false });
    else m.reply().fail(new TypeError('network'));
    await done;
    if (outcome === 'ok') {
      assert.equal(m.body.hidden, true, 'ok: the form is hidden');
      assert.equal(m.success.hidden, false, 'ok: the success message shows');
      assert.equal(m.doc.activeElement, m.success, `${lang} ok: the focus is on the success message`);
      assert.equal(shown(region), '', `${lang} ok: no error`);
    } else {
      assert.equal(m.body.hidden, false, `${outcome}: the form stays`);
      assert.equal(m.success.hidden, true, `${outcome}: no success message`);
      assert.equal(m.button.disabled, false, `${outcome}: the button is usable again`);
      assert.equal(m.button.textContent, m.sendLabel, `${outcome}: the button reads its label again`);
      assert.equal(m.form.resets, 0, `${outcome}: the form keeps what was typed`);
      assert.equal(shown(region), i18n(lang, 'contactError'), `${lang} · ${outcome}: the visitor reads contactError`);
      const again = m.handlers.submit({ preventDefault() {} });
      assert.equal(shown(region), '', `${lang} · ${outcome}: sending again empties the region while the request is out`);
      m.reply().fail(new TypeError('network'));
      await again;
      assert.equal(shown(region), i18n(lang, 'contactError'), `${lang} · ${outcome}: the next failure writes the error again`);
    }
  }
});

// Contract: at rest the success message is hidden by its `hidden` attribute and no rule of the
// component overrides that with a display value, so a visitor never reads "Message sent!" before
// sending; the form wrapper the script hides has no display rule either.
// Breaks when: someone gives .contact-success (or #form-success, #contact-body) a display value to
// lay it out (author CSS beats the [hidden] default), and the success text shows at rest.
// Not covered by: test/site-demo.test.mjs forbids display: none in the component, which pushes
// toward the attribute, but nothing checks that the attribute is there and still wins.
test('contact form: the success message is hidden at rest by an attribute no rule overrides', () => {
  const source = component('ContactForm');
  const markup = markupOf(source);
  assert.match(markup, /<[a-z]+\b[^>]*\sid="form-success"[^>]*\shidden\b/, 'the success message carries hidden');
  const style = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  for (const rule of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = rule[1].trim();
    if (!/\.contact-success\b|#form-success\b|#contact-body\b/.test(selector)) continue;
    if (/\[hidden\]/.test(selector)) continue;
    assert.doesNotMatch(rule[2], /(^|;|\s)display\s*:/, `${selector} sets display and beats [hidden]`);
  }
});

// ---------------------------------------------------------------------------------------------
// Content of today, outside comments.

// Contract: every i18n key a component of this half references reaches the markup, not a comment
// (the content of today stays whole, decision 11 and the spec's "o texto do site não muda"): a key
// written in the markup is outside comments, and a key gathered in the frontmatter (the use cases
// and the commands are arrays of objects built from `t.*`, the demo builds lists of checks and
// files) is used by the markup through its binding and, for objects, through each property.
// Breaks when: a line of the conversation, a use case field or a command field is commented out
// during a redesign ({/* <p>{uc.desc}</p> */}); the key is still in the file, so a check that
// greps the file for `t.key` keeps passing while the page loses the sentence.
// Not covered by: test/site-demo.test.mjs collects `t.key` from the whole file, comments and
// frontmatter included; check-home.mjs, which reads the built page, checks only the use case
// titles, the command links and some demo keys, and runs by hand.
test('content: every i18n key of the five components reaches the markup, outside comments', () => {
  const keys = (text) => new Set([...text.matchAll(/(?<![\w$.])t\.(\w+)/g)].map((m) => m[1]));
  const strip = (text) => text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');
  for (const name of ['LiveDemo', 'UseCases', 'Features', 'FinalCTA', 'ContactForm']) {
    const source = component(name);
    const [, front = '', rest = ''] = source.split(/^---\s*$/m);
    const markup = strip(rest.split(/<script\b|<style\b/)[0]);
    const frontKeys = keys(strip(front));
    const markupKeys = keys(markup);
    const lost = [...keys(source)].filter((k) => !markupKeys.has(k) && !frontKeys.has(k));
    assert.deepEqual(lost, [], `${name}: keys only in comments`);
    // bindings of the frontmatter built from i18n values, and the properties of their objects
    const statements = strip(front).split(/\n(?=const\s)/);
    for (const statement of statements) {
      const binding = /^const\s+(\w+)\s*=/.exec(statement)?.[1];
      if (!binding || binding === 't' || !/(?<![\w$.])t\./.test(statement)) continue;
      assert.match(markup, new RegExp(`\\b${binding}\\b`), `${name}: ${binding} (built from i18n) is not used by the markup`);
      for (const prop of new Set([...statement.matchAll(/(\w+):\s*t\.\w+/g)].map((m) => m[1]))) {
        assert.match(markup, new RegExp(`\\.${prop}\\b`), `${name}: the ${prop} of ${binding} is not used by the markup`);
      }
    }
  }
});
