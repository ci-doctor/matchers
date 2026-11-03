// The TS engine must produce exactly what ci-doctor's `matchers verify` writes to a
// `.expected` file, for every registry fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { prepare, run, validate, type Matcher, type Provider } from '../src/lib/engine.ts';

/** Port of `verify.matcher_output`: `extract._merge` + `_render`, "" when nothing fired. */
function output(raw: string, provider: Provider, m: Matcher): string {
  const lines = prepare(raw, provider).lines.map((l) => l.text);
  const wins = run(lines, m).windows.toSorted((a, b) => a[0] - b[0]);
  if (!wins.length) return '';
  const merged: [number, number][] = [];
  for (const [s, e] of wins) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: string[] = [];
  let prev = 0;
  for (const [s, e] of merged) {
    if (s > prev) out.push(`… [${s - prev} lines elided] …`);
    out.push(...lines.slice(s, e));
    prev = e;
  }
  if (prev < lines.length) out.push(`… [${lines.length - prev} lines elided] …`);
  return out.join('\n') + '\n';
}

const root = new URL('../../matchers/', import.meta.url);
let n = 0;
for (const eco of readdirSync(root)) {
  for (const id of readdirSync(new URL(`${eco}/`, root))) {
    const dir = new URL(`${eco}/${id}/`, root);
    const m = parse(readFileSync(new URL('matcher.yaml', dir), 'utf8')) as Matcher;
    test(`${id}: valid`, () => assert.deepEqual(validate(m), []));
    for (const f of readdirSync(new URL('fixtures/', dir)).filter((f) => f.endsWith('.log'))) {
      const tag = /\.(github|gitlab)\.log$/.exec(f)?.[1] as Provider | undefined;
      const raw = readFileSync(new URL(`fixtures/${f}`, dir), 'utf8');
      const want = readFileSync(new URL(`fixtures/${f.replace(/\.log$/, '.expected')}`, dir), 'utf8');
      // An untagged log is shown under both providers (registry.ts), so it must hold under both.
      for (const p of tag ? [tag] : (['github', 'gitlab'] as const)) {
        n++;
        test(`${id}/${f} (${p})`, () => assert.equal(output(raw, p, m), want));
      }
    }
  }
}
test('fixtures found', () => assert.ok(n >= 76, `only ${n} fixtures`));

