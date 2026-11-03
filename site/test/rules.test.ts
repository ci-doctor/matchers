import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRules } from '../src/scripts/playground/rules.ts';

test('errors name the rule by its place in the editor, valid or not', () => {
  const { errors } = parseRules('- a\n---\n- b\n---\nfoo: [\n');
  assert.deepEqual(errors.map((e) => e.split(':')[0]), ['rule 1', 'rule 2', 'rule 3']);
});
