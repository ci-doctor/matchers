// Playground wiring: rule editor + log input -> matches, rendered into the log view and match list.
import { prepare, type Matcher } from '../../lib/engine.ts';
import { combo } from './combo.ts';
import { data, ruleItems, ruleSource, ruleValue } from './data.ts';
import { createEditor } from './editor.ts';
import { createLogInput } from './log-input.ts';
import { findMatches } from './matches.ts';
import { renderEmpty, renderMarked, renderRaw, revealLine, scrollToFirstHit } from './log-view.ts';
import { onMatchClick, renderMatchList } from './match-list.ts';
import { parseRules } from './rules.ts';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const out = el('out');
const matchList = el('results');
const stats = el('stats');
const ruleText = el<HTMLTextAreaElement>('rule');

const editor = createEditor(ruleText, el('hl'), el('status'));
const logInput = createLogInput(el<HTMLTextAreaElement>('log'), { render, renderSoon });
const ruleBox = combo(el('pick'), ruleItems, (value) => {
  editor.source = ruleSource(value);
  render();
});

const nameOf = (m: Matcher) => (m.id in data.matchers ? `official/${m.id}` : m.id);
const view = () => document.querySelector<HTMLInputElement>('input[name=view]:checked')!.value as 'matches' | 'raw';

function render({ scrollToFirst = false } = {}) {
  const { rules, errors, badLines } = parseRules(editor.source);
  editor.paint(badLines);
  editor.showStatus(errors, rules.length);

  const raw = logInput.raw;
  if (!raw || view() === 'raw') {
    if (raw) renderRaw(out, raw);
    else renderEmpty(out);
    stats.textContent = '';
    matchList.innerHTML = '';
    return;
  }
  const prep = prepare(raw, logInput.provider());
  const { marks, windows } = findMatches(prep, rules, nameOf);
  renderMatchList(matchList, windows, rules.length);
  stats.textContent = `${marks.size} of ${prep.lines.length} lines highlighted`;
  renderMarked(out, prep, marks);
  if (scrollToFirst) scrollToFirstHit(out);
}

let timer: ReturnType<typeof setTimeout>;
function renderSoon() {
  clearTimeout(timer);
  timer = setTimeout(render, 200);
}

// Keep the overlay in step while typing; error marks come with the debounced run.
ruleText.addEventListener('input', () => { editor.paint(); renderSoon(); });
document.querySelectorAll('input[name=view]').forEach((r) => r.addEventListener('change', () => render()));
onMatchClick(matchList, revealLine);

// ?m=<matcher|bundle>&f=<fixture>: preload a rule and one of its fixtures.
function preloadFromUrl(): boolean {
  const q = new URLSearchParams(location.search);
  const name = q.get('m');
  if (!name || !(name in data.matchers || name in data.bundles)) return false;
  editor.source = ruleSource(ruleValue(name));
  ruleBox.set(ruleValue(name));
  const owner = name in data.matchers ? name : data.bundles[name].members.find((n) => data.matchers[n].fixtures.length);
  const fixture = q.get('f') ?? (owner && data.matchers[owner].fixtures[0]?.name);
  if (owner && fixture) logInput.loadFixture(`${owner}/${fixture}`);
  return true;
}

if (!preloadFromUrl()) {
  editor.source = ruleSource('');
  ruleBox.set('');
}
render({ scrollToFirst: true });
