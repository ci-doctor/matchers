// Every fixture in the registry: the TS engine must select exactly the lines the
// Python (`.expected`) selected. GitHub logs, since all fixtures are GitHub logs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { prepare, run, highlighted, expectedLines, validate, type Matcher } from '../src/lib/engine.ts';

const root = new URL('../../matchers/', import.meta.url);
let n = 0;
for (const eco of readdirSync(root)) {
  for (const id of readdirSync(new URL(`${eco}/`, root))) {
    const dir = new URL(`${eco}/${id}/`, root);
    const m = parse(readFileSync(new URL('matcher.yaml', dir), 'utf8')) as Matcher;
    test(`${id}: valid`, () => assert.deepEqual(validate(m), []));
    for (const f of readdirSync(new URL('fixtures/', dir)).filter((f) => f.endsWith('.log'))) {
      n++;
      test(`${id}/${f}`, () => {
        const lines = prepare(readFileSync(new URL(`fixtures/${f}`, dir), 'utf8'), 'github').lines.map((l) => l.text);
        const want = expectedLines(readFileSync(new URL(`fixtures/${f.replace(/\.log$/, '.expected')}`, dir), 'utf8'));
        assert.deepEqual(highlighted(run(lines, m)).map((i) => lines[i]), want);
      });
    }
  }
}
test('fixtures found', () => assert.ok(n >= 38, `only ${n} fixtures`));
