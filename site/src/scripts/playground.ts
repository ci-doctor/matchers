import { parseAllDocuments } from 'yaml';
import { highlight } from './yamlhl.ts';
import { combo, type Item } from './combo.ts';
import { prepare, run, highlighted, validate, type Matcher, type Provider } from '../lib/engine.ts';

interface Data {
  matchers: Record<string, { yaml: string; eco: string; description: string; fixtures: { name: string; logs: Partial<Record<'github' | 'gitlab' | 'any', string>> }[] }>;
  bundles: Record<string, string[]>;
  bundleDesc: Record<string, string>;
}
const data: Data = JSON.parse(document.getElementById('data')!.textContent!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rule = $<HTMLTextAreaElement>('rule'), log = $<HTMLTextAreaElement>('log'), out = $('out');
const radio = (name: string) => (document.querySelector(`input[name=${name}]:checked`) as HTMLInputElement).value;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const HUES = [48, 200, 130, 330, 20, 270, 170, 90];
const color = (i: number) => `hsl(${HUES[i % HUES.length]} 85% 55%)`;

/** Where each validation message points: the line of the key it names. */
function parseRules(src: string): { rules: { m: Matcher; name: string }[]; errors: string[]; bad: Set<number> } {
  const rules: { m: Matcher; name: string }[] = [];
  const errors: string[] = [];
  const bad = new Set<number>();
  const lineAt = (off: number) => src.slice(0, off).split('\n').length - 1;
  const docs = parseAllDocuments(src).filter((d) => d.contents !== null || d.errors.length);
  for (const d of docs) {
    const pre = docs.length > 1 ? `rule ${rules.length + 1}: ` : '';
    if (d.errors.length) {
      for (const e of d.errors) {
        errors.push(pre + e.message.split('\n')[0]);
        bad.add(e.linePos ? e.linePos[0].line - 1 : lineAt(e.pos[0]));
      }
      continue;
    }
    const m = d.toJS() as Matcher;
    const top = lineAt(d.range[0]);
    if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(pre + 'a rule must be a YAML mapping'); bad.add(top); continue; }
    const keyLine = new Map<string, number>();
    const map = d.contents as { items?: { key?: { value?: unknown; range?: number[] } }[] };
    for (const it of map.items ?? []) if (it.key?.range) keyLine.set(String(it.key.value), lineAt(it.key.range[0]));
    const errs = validate(m);
    for (const e of errs) {
      errors.push(`${m.id ? m.id + ': ' : pre}${e}`);
      const k = /^`?(\w+)/.exec(e)?.[1] ?? '';
      if (/^use exactly one form/.test(e)) {
        const ks = ['pattern', 'start', 'end'].filter((x) => keyLine.has(x));
        (ks.length ? ks.map((x) => keyLine.get(x)!) : [top]).forEach((l) => bad.add(l));
      } else bad.add(keyLine.get(k) ?? top);
    }
    if (!errs.length) rules.push({ m, name: m.id in data.matchers ? `official/${m.id}` : m.id });
  }
  return { rules, errors, bad };
}

const hl = $('hl');
function paint(bad: Set<number>) {
  hl.innerHTML = highlight(rule.value, bad);
  hl.scrollTop = rule.scrollTop;
  hl.scrollLeft = rule.scrollLeft;
}

let scrollToFirst = false;
function render() {
  const { rules, errors, bad } = parseRules(rule.value);
  paint(bad);
  $('status').innerHTML = errors.length
    ? `<ul class="errs">${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
    : rules.length ? `<p class="ok">Valid.</p>` : '';

  const raw = log.value;
  if (!raw) {
    out.innerHTML = '<p class="empty">Paste a log, drop a file or load a fixture to see matches.</p>';
    $('stats').textContent = '';
    $('results').innerHTML = '';
    return;
  }
  if (radio('view') === 'raw') {
    out.innerHTML = raw.split('\n').map((l, i) => `<div class="ln" id="L${i + 1}"><i>${i + 1}</i>${esc(l)}</div>`).join('');
    $('stats').textContent = '';
    $('results').innerHTML = '';
    return;
  }
  const prep = prepare(raw, radio('prov') as Provider);
  const texts = prep.lines.map((l) => l.text);
  const style = new Map<number, { cls: string; hl: string; by: string[] }>();
  const results: string[] = [];
  rules.forEach(({ m, name }, ri) => {
    const r = run(texts, m);
    const anchors = new Set(r.anchors.map((i) => prep.lines[i].pos));
    for (const i of highlighted(r)) {
      const pos = prep.lines[i].pos;
      const s = style.get(pos) ?? { cls: '', hl: color(ri), by: [] };
      s.by.push(name);
      if (anchors.has(pos)) s.cls = ' anchor';
      style.set(pos, s);
    }
    for (const [a, b] of r.windows) {
      const ps = prep.lines.slice(a, b).map((l) => l.pos);
      const lo = Math.min(...ps) + 1, hi = Math.max(...ps) + 1;
      results.push(`<li><span class="sw" style="--hl:${color(ri)}"></span><a data-l="${lo}">${esc(name)} · lines ${lo}–${hi}</a></li>`);
    }
  });
  $('results').innerHTML = results.join('') || (rules.length ? '<li class="legend">No matches.</li>' : '<li class="legend">Fix the rule to see matches.</li>');
  $('stats').textContent = raw ? `${style.size} of ${prep.lines.length} lines highlighted` : '';
  out.innerHTML = prep.display.map((l, i) => {
    const s = style.get(i);
    const cls = `ln${l.structure ? ' structure' : ''}${s ? ' hit' + s.cls : ''}`;
    const attr = s ? ` style="--hl:${s.hl}" title="${esc(s.by.join(', '))}"` : '';
    return `<div class="${cls}" id="L${i + 1}"${attr}><i>${i + 1}</i>${esc(l.text)}</div>`;
  }).join('');
  if (scrollToFirst) {
    scrollToFirst = false;
    const hit = out.querySelector('.hit') as HTMLElement | null;
    if (hit) out.scrollTop = hit.offsetTop - out.offsetTop - 40;
  }
}

let timer: number;
const soon = () => { clearTimeout(timer); timer = setTimeout(render, 200); };
const typing = () => { paint(new Set()); soon(); }; // keep the overlay in step; marks come with the debounced run

function pickRule(v: string) {
  if (v.startsWith('m:')) rule.value = data.matchers[v.slice(2)].yaml;
  else if (v.startsWith('b:')) rule.value = data.bundles[v.slice(2)].map((n) => data.matchers[n].yaml.trimEnd()).join('\n---\n') + '\n';
  else rule.value = 'id: my_rule\nrole: tool\nclassification: [any]\ndescription: Describe what this rule catches in a sentence or two.\npattern: ^ERROR\nbefore: 0\nafter: 3\n';
}
type Fx = Data['matchers'][string]['fixtures'][number];
const NAMES = { github: 'GitHub Actions', gitlab: 'GitLab CI' } as const;
const logFor = (fx: Fx, p: Provider) => fx.logs[p] ?? fx.logs.any;
let curFx: Fx | null = null; // the fixture whose log is in the box, until the user changes it

/** Enable only the providers the loaded fixture has a log for; pasted or dropped logs enable both. */
function setAvail() {
  for (const p of ['github', 'gitlab'] as const) {
    const ok = !curFx || !!logFor(curFx, p);
    const lab = $('lab-' + p), input = lab.querySelector('input')!;
    input.disabled = !ok;
    input.setAttribute('aria-disabled', String(!ok));
    lab.title = ok ? '' : `No ${p === 'github' ? 'GitHub' : 'GitLab'} log for this fixture`;
  }
}
const provider = () => radio('prov') as Provider;
function loadFixture(key: string) {
  const [m, f] = key.split('/');
  const fx = data.matchers[m]?.fixtures.find((x) => x.name === f);
  if (!fx) return;
  curFx = fx;
  const p = logFor(fx, provider()) ? provider() : provider() === 'github' ? 'gitlab' : 'github';
  (document.querySelector(`input[name=prov][value=${p}]`) as HTMLInputElement).checked = true;
  setAvail();
  $('notice').textContent = '';
  log.value = logFor(fx, p)!;
  scrollToFirst = true;
  fixtureBox.set(key);
}
function detach() { // the user's own text: both providers make sense again
  curFx = null;
  fixtureBox.set('');
  setAvail();
}

rule.addEventListener('input', typing);
rule.addEventListener('scroll', () => { hl.scrollTop = rule.scrollTop; hl.scrollLeft = rule.scrollLeft; });
log.addEventListener('input', () => { $('notice').textContent = ''; detach(); soon(); });
document.querySelectorAll('input[name=prov],input[name=view]').forEach((r) => r.addEventListener('change', () => {
  $('notice').textContent = '';
  const fx = curFx && logFor(curFx, provider());
  if (fx && (r as HTMLInputElement).name === 'prov') { log.value = fx; scrollToFirst = true; }
  render();
}));
const ruleItems: Item[] = [
  { value: '', label: 'New rule', group: '', hay: 'new rule blank' },
  ...Object.entries(data.bundleDesc).map(([n, d]) => ({ value: 'b:' + n, label: n, group: 'Bundles', sub: d, hay: `${n} bundle ${d}`.toLowerCase() })),
  ...Object.entries(data.matchers)
    .sort((a, b) => a[1].eco.localeCompare(b[1].eco) || a[0].localeCompare(b[0]))
    .map(([n, m]) => ({ value: 'm:' + n, label: n, group: `Matchers · ${m.eco}`, sub: m.description, hay: `${n} ${m.eco} ${m.description}`.toLowerCase() })),
];
const fixtureItems: Item[] = Object.entries(data.matchers)
  .sort((a, b) => a[1].eco.localeCompare(b[1].eco) || a[0].localeCompare(b[0]))
  .flatMap(([n, m]) => m.fixtures.map((f) => ({ value: `${n}/${f.name}`, label: f.name, group: n, sub: m.eco, hay: `${n} ${m.eco} ${f.name}`.toLowerCase() })));
const ruleBox = combo($('pick'), ruleItems, (v) => { pickRule(v); setAvail(); render(); });
const fixtureBox = combo($('fixture'), fixtureItems, (v) => { loadFixture(v); render(); });
ruleBox.set('');

$('results').addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-l]') as HTMLElement | null;
  const el = a && document.getElementById('L' + a.dataset.l);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
});

const dz = $('dz');
async function readFile(f: File | undefined) {
  if (!f) return;
  log.value = await f.text();
  detach();
  $('notice').textContent = '';
  $('dzt').innerHTML = `<b>${esc(f.name)}</b> · drop or browse to replace`;
  render();
}
$<HTMLInputElement>('file').addEventListener('change', (e) => readFile((e.target as HTMLInputElement).files?.[0]));
for (const el of [dz, log]) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drop'); readFile((e as DragEvent).dataTransfer?.files[0]); });
}

// ?m=<name|bundle>&f=<fixture>: preload a rule and one of its fixtures.
const q = new URLSearchParams(location.search);
const name = q.get('m');
if (name && (name in data.matchers || name in data.bundles)) {
  const isM = name in data.matchers;
  pickRule((isM ? 'm:' : 'b:') + name);
  ruleBox.set((isM ? 'm:' : 'b:') + name);
  const owner = isM ? name : data.bundles[name].find((n) => data.matchers[n].fixtures.length);
  const fx = q.get('f') ?? data.matchers[owner!]?.fixtures[0]?.name;
  if (owner && fx) loadFixture(`${owner}/${fx}`);
} else pickRule('');
render();
