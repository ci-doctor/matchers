// Playground colouring: each firing matcher gets its own palette colour, cycling past the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, type Matcher } from '../src/lib/engine.ts';
import { findMatches, PALETTE } from '../src/scripts/playground/matches.ts';

const rule = (id: string, pattern: string): Matcher => ({ id, pattern });
const colourOf = (windows: { rule: string; colour: string }[]) => new Map(windows.map((w) => [w.rule, w.colour]));

test('distinct colours per firing matcher, silent ones skipped', () => {
  const prep = prepare('a\nnope\nb\n', 'github');
  const { windows } = findMatches(prep, [rule('x', 'a'), rule('silent', 'zzz'), rule('y', 'b')], (m) => m.id);
  assert.deepEqual(colourOf(windows), new Map([['x', PALETTE[0]], ['y', PALETTE[1]]]));
});

test('more matchers than colours: the palette cycles', () => {
  const n = PALETTE.length + 1;
  const ids = Array.from({ length: n }, (_, i) => `r${i}`);
  const prep = prepare(ids.join('\n'), 'github');
  const { windows } = findMatches(prep, ids.map((id) => rule(id, `^${id}$`)), (m) => m.id);
  assert.equal(colourOf(windows).get(`r${n - 1}`), PALETTE[0]);
  assert.equal(new Set(windows.slice(0, PALETTE.length).map((w) => w.colour)).size, PALETTE.length);
});
