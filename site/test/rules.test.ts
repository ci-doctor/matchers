import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRules } from '../src/scripts/playground/rules.ts';

test('errors name the rule by its place in the editor, valid or not', () => {
  const { errors } = parseRules('- a\n---\n- b\n---\nfoo: [\n');
  assert.deepEqual(errors.map((e) => e.split(':')[0]), ['rule 1', 'rule 2', 'rule 3']);
});

test('exclude entries must be non-empty strings that compile', () => {
  const rule = 'id: t\nrole: tool\ndescription: twenty characters or more\npattern: x\nexclude:\n';
  for (const bad of ["  - ''", '  - 3', '  - "("']) {
    const { rules, errors } = parseRules(rule + bad + '\n');
    assert.equal(rules.length, 0, bad);
    assert.match(errors[0], /exclude\[0\]/);
  }
  assert.equal(parseRules(rule + '  - y\n').rules.length, 1);
});
