// Build-time read of the registry files one level up. Nothing here ships to the browser,
// and nothing matches: every selection shown is a committed `.expected`, ci-doctor's own output.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { parse } from 'yaml';

const root = resolve(process.cwd(), '..'); // `npm run build` runs in site/

export const GITHUB = 'https://github.com/ci-doctor/matchers';

export type Framing = 'github' | 'gitlab' | 'plain';
export const FRAMING_NAME: Record<Framing, string> = { github: 'GitHub Actions', gitlab: 'GitLab CI', plain: 'plain' };

export interface Output {
  /** `ruff.check`, or the matcher's own id when it has one output. */
  id: string;
  role: string;
  description: string;
  variants: string[];
}
export interface Fixture {
  /** The file name without `.log`, e.g. `assert.github`. */
  name: string;
  framing: Framing;
  log: string;
  /** Each output's committed selection, by output id; "" means it must not fire. */
  expected: Record<string, string>;
}
export interface Entry {
  name: string;
  kind: 'matcher' | 'bundle';
  path: string;
  yaml: string;
  eco: string;
  tags: string[];
  outputs: Output[];
  description: string;
  /** Matcher names this bundle expands to (empty for a matcher). */
  members: string[];
  /** Bundles that contain this entry, directly or through another bundle. */
  containedIn: string[];
  fixtures: Fixture[];
}

interface IndexEntry {
  path: string;
  description: string;
  tags?: string[];
  ecosystem?: string;
  outputs?: string[];
}
interface Spec {
  role?: string;
  description: string;
  variants?: Record<string, unknown>;
  outputs?: Record<string, { role?: string; description: string; variants?: Record<string, unknown> }>;
}

const read = (p: string) => readFileSync(join(root, p), 'utf8');

function outputsOf(name: string, spec: Spec): Output[] {
  const one = (id: string, o: { role?: string; description: string; variants?: Record<string, unknown> }) => ({
    id, role: o.role ?? 'tool', description: o.description, variants: Object.keys(o.variants ?? {}),
  });
  if (!spec.outputs) return [one(name, spec)];
  return Object.entries(spec.outputs).map(([k, o]) => one(`${name}.${k}`, o));
}

function fixturesOf(dir: string, outputs: Output[], name: string): Fixture[] {
  const fx = join(root, dir, 'fixtures');
  if (!existsSync(fx)) return [];
  return readdirSync(fx).filter((f) => f.endsWith('.log')).sort().map((f) => {
    const stem = f.slice(0, -'.log'.length);
    const framing = (/\.(github|gitlab)$/.exec(stem)?.[1] ?? 'plain') as Framing;
    const golden = (id: string) => join(fx, `${stem}${id === name ? '' : id.slice(name.length)}.expected`);
    const expected = Object.fromEntries(
      outputs.map((o) => [o.id, existsSync(golden(o.id)) ? readFileSync(golden(o.id), 'utf8') : '']),
    );
    return { name: stem, framing, log: readFileSync(join(fx, f), 'utf8'), expected };
  });
}

function load(): Entry[] {
  const index = parse(read('index.yaml')) as {
    matchers: Record<string, IndexEntry>;
    bundles: Record<string, IndexEntry>;
  };
  const isMatcher = (n: string) => Object.hasOwn(index.matchers, n);

  const includes = new Map(
    Object.entries(index.bundles).map(([n, b]) => [n, (parse(read(b.path)) as { include: string[] }).include]),
  );
  /** Everything a bundle includes, through nested bundles, each once; a cycle stops at the repeat. */
  const expand = (n: string, seen = new Set<string>()): Set<string> => {
    for (const x of includes.get(n)!) if (!seen.has(x)) (seen.add(x), includes.has(x) && expand(x, seen));
    return seen;
  };
  const contents = new Map([...includes.keys()].map((b) => [b, expand(b)]));

  const entries: Entry[] = Object.entries(index.matchers).map(([name, m]) => {
    const yaml = read(m.path);
    const outputs = outputsOf(name, parse(yaml) as Spec);
    return {
      name, kind: 'matcher', path: m.path, yaml, eco: m.ecosystem ?? '', tags: m.tags ?? [], outputs,
      description: m.description, members: [], containedIn: [], fixtures: fixturesOf(dirname(m.path), outputs, name),
    };
  });
  for (const [name, b] of Object.entries(index.bundles)) {
    entries.push({
      name, kind: 'bundle', path: b.path, yaml: read(b.path), eco: 'bundle', tags: [], outputs: [],
      description: b.description, members: [...contents.get(name)!].filter(isMatcher), containedIn: [], fixtures: [],
    });
  }
  for (const e of entries) e.containedIn = [...contents].filter(([b, c]) => b !== e.name && c.has(e.name)).map(([b]) => b);
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export const entries = load();
export const byName = (n: string) => entries.find((e) => e.name === n)!;
