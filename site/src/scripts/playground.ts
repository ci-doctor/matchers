import { parseAllDocuments } from 'yaml';
import { prepare, run, highlighted, validate, type Matcher, type Provider } from '../lib/engine.ts';

interface Data {
  matchers: Record<string, { yaml: string; fixtures: { name: string; log: string }[] }>;
  bundles: Record<string, string[]>;
}
const data: Data = JSON.parse(document.getElementById('data')!.textContent!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rule = $<HTMLTextAreaElement>('rule'), log = $<HTMLTextAreaElement>('log'), out = $('out');
const radio = (name: string) => (document.querySelector(`input[name=${name}]:checked`) as HTMLInputElement).value;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const HUES = [48, 200, 130, 330, 20, 270, 170, 90];
const color = (i: number) => `hsl(${HUES[i % HUES.length]} 85% 55%)`;

function parseRules(src: string): { rules: { m: Matcher; name: string }[]; errors: string[] } {
  const rules: { m: Matcher; name: string }[] = [];
  const errors: string[] = [];
  const docs = parseAllDocuments(src).filter((d) => d.contents !== null || d.errors.length);
  for (const d of docs) {
    const pre = docs.length > 1 ? `rule ${rules.length + 1}: ` : '';
    if (d.errors.length) { errors.push(...d.errors.map((e) => pre + e.message.split('\n')[0])); continue; }
    const m = d.toJS() as Matcher;
    if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(pre + 'a rule must be a YAML mapping'); continue; }
    const errs = validate(m);
    if (errs.length) errors.push(...errs.map((e) => `${m.id ? m.id + ': ' : pre}${e}`));
    else rules.push({ m, name: m.id in data.matchers ? `official/${m.id}` : m.id });
  }
  return { rules, errors };
}

let scrollToFirst = false;
function render() {
  const { rules, errors } = parseRules(rule.value);
  $('status').innerHTML = errors.length
    ? `<ul class="errs">${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
    : rules.length ? `<p class="ok">Valid.</p>` : '';

  const raw = log.value;
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
  $('results').innerHTML = results.join('') || (rules.length && raw ? '<li class="legend">No matches.</li>' : '');
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

function pickRule(v: string) {
  if (v.startsWith('m:')) rule.value = data.matchers[v.slice(2)].yaml;
  else if (v.startsWith('b:')) rule.value = data.bundles[v.slice(2)].map((n) => data.matchers[n].yaml.trimEnd()).join('\n---\n') + '\n';
  else rule.value = 'id: my_rule\nrole: tool\nclassification: [any]\ndescription: Describe what this rule catches in a sentence or two.\npattern: ^ERROR\nbefore: 0\nafter: 3\n';
}
function loadFixture(key: string) {
  const [m, f] = key.split('/');
  const fx = data.matchers[m]?.fixtures.find((x) => x.name === f);
  if (!fx) return;
  if (radio('prov') !== 'github') {
    $('notice').textContent = 'No GitLab log for this fixture yet. Switch to GitHub Actions to load it.';
    return;
  }
  $('notice').textContent = '';
  log.value = fx.log;
  scrollToFirst = true;
  $<HTMLSelectElement>('fixture').value = key;
}

$('pick').addEventListener('change', (e) => { pickRule((e.target as HTMLSelectElement).value); render(); });
$('fixture').addEventListener('change', (e) => { loadFixture((e.target as HTMLSelectElement).value); render(); });
rule.addEventListener('input', soon);
log.addEventListener('input', () => { $('notice').textContent = ''; soon(); });
document.querySelectorAll('input[name=prov],input[name=view]').forEach((r) => r.addEventListener('change', () => {
  $('notice').textContent = '';
  render();
}));
$('results').addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-l]') as HTMLElement | null;
  const el = a && document.getElementById('L' + a.dataset.l);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
});

async function readFile(f: File | undefined) {
  if (!f) return;
  log.value = await f.text();
  $('notice').textContent = '';
  render();
}
$<HTMLInputElement>('file').addEventListener('change', (e) => readFile((e.target as HTMLInputElement).files?.[0]));
log.addEventListener('dragover', (e) => { e.preventDefault(); log.classList.add('drop'); });
log.addEventListener('dragleave', () => log.classList.remove('drop'));
log.addEventListener('drop', (e) => { e.preventDefault(); log.classList.remove('drop'); readFile(e.dataTransfer?.files[0]); });

// ?m=<name|bundle>&f=<fixture>: preload a rule and one of its fixtures.
const q = new URLSearchParams(location.search);
const name = q.get('m');
if (name && (name in data.matchers || name in data.bundles)) {
  const isM = name in data.matchers;
  pickRule((isM ? 'm:' : 'b:') + name);
  $<HTMLSelectElement>('pick').value = (isM ? 'm:' : 'b:') + name;
  const owner = isM ? name : data.bundles[name].find((n) => data.matchers[n].fixtures.length);
  const fx = q.get('f') ?? data.matchers[owner!]?.fixtures[0]?.name;
  if (owner && fx) loadFixture(`${owner}/${fx}`);
} else pickRule('');
render();
