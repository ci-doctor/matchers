// Build-time read of the registry files one level up. Nothing here ships to the browser.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { prepare, run, highlighted, type Matcher } from './engine.ts';

const root = resolve(process.cwd(), '..'); // `npm run build` runs in site/

export const GITHUB = 'https://github.com/ci-doctor/matchers';

export type P = 'github' | 'gitlab';
export interface Variant {
  display: { text: string; structure: boolean }[];
  /** Highlighted / anchor lines, as display positions. */
  hit: Set<number>;
  anchors: Set<number>;
  mustNotFire: boolean;
}
/** One case: up to two provider logs. A provider-less `<case>.log` serves both. */
export interface Fixture {
  name: string;
  /** Raw logs by file tag; `any` is a provider-less log. */
  logs: Partial<Record<P | 'any', string>>;
  variants: Partial<Record<P, Variant>>;
}
export interface Entry {
  name: string;
  kind: 'matcher' | 'bundle';
  path: string;
  yaml: string;
  eco: string;
  tags: string[];
  role: string;
  description: string;
  /** Matcher names this bundle expands to (empty for a matcher). */
  members: string[];
  /** Bundles that contain this entry, directly or through another bundle. */
  containedIn: string[];
  fixtures: Fixture[];
}

const read = (p: string) => readFileSync(join(root, p), 'utf8');

function load(): Entry[] {
  const index = parse(read('index.yaml')) as {
    matchers: Record<string, { path: string; description: string; classification: string[] }>;
    bundles: Record<string, { path: string; description: string }>;
  };
  for (const n of Object.keys(index.bundles)) if (n in index.matchers) throw new Error(`${n} is both a matcher and a bundle`);

  const bundles = Object.fromEntries(
    Object.entries(index.bundles).map(([n, b]) => [n, (parse(read(b.path)) as { include: string[] }).include]),
  );
  const flat = (n: string, seen = new Set<string>()): string[] =>
    n in index.matchers ? [n] : seen.has(n) ? [] : (seen.add(n), bundles[n].flatMap((x) => flat(x, seen)));
  const closure = (n: string): string[] => (n in bundles ? [n, ...bundles[n].flatMap(closure)] : [n]);

  const entries: Entry[] = Object.entries(index.matchers).map(([name, m]) => {
    const yaml = read(m.path);
    const spec = parse(yaml) as Matcher;
    const dir = dirname(m.path);
    const fx = join(root, dir, 'fixtures');
    const cases = new Map<string, Fixture>();
    for (const f of existsSync(fx) ? readdirSync(fx).filter((f) => f.endsWith('.log')).sort() : []) {
      const tag = /\.(github|gitlab)\.log$/.exec(f)?.[1] as P | undefined;
      const name = f.replace(/\.(github|gitlab)\.log$|\.log$/, '');
      const c = cases.get(name) ?? { name, logs: {}, variants: {} };
      cases.set(name, c);
      const log = readFileSync(join(fx, f), 'utf8');
      c.logs[tag ?? 'any'] = log;
      const mustNotFire = readFileSync(join(fx, f.replace(/\.log$/, '.expected')), 'utf8') === '';
      for (const p of tag ? [tag] : (['github', 'gitlab'] as P[])) {
        const prep = prepare(log, p);
        const r = run(prep.lines.map((l) => l.text), spec);
        c.variants[p] = {
          display: prep.display,
          hit: new Set(highlighted(r).map((i) => prep.lines[i].pos)),
          anchors: new Set(r.anchors.map((i) => prep.lines[i].pos)),
          mustNotFire,
        };
      }
    }
    const fixtures = [...cases.values()];
    return {
      name, kind: 'matcher', path: m.path, yaml, eco: m.classification[0], tags: m.classification.slice(1),
      role: spec.role ?? '', description: m.description, members: [], containedIn: [], fixtures,
    };
  });
  for (const [name, b] of Object.entries(index.bundles)) {
    entries.push({
      name, kind: 'bundle', path: b.path, yaml: read(b.path), eco: 'bundle', tags: [], role: '',
      description: b.description, members: [...new Set(flat(name))], containedIn: [], fixtures: [],
    });
  }
  for (const e of entries) e.containedIn = Object.keys(bundles).filter((b) => b !== e.name && closure(b).slice(1).includes(e.name));
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export const entries = load();
export const byName = (n: string) => entries.find((e) => e.name === n)!;
