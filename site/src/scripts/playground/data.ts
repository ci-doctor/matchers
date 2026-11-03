// The registry slice the playground page embeds as JSON (see playground.astro),
// and the combobox items built from it.
import type { Provider } from '../../lib/engine.ts';
import type { Item } from './combo.ts';

export interface Fixture {
  name: string;
  /** Raw logs by file tag; `any` is a provider-less log that serves both providers. */
  logs: Partial<Record<Provider | 'any', string>>;
}
export interface MatcherInfo {
  yaml: string;
  eco: string;
  description: string;
  fixtures: Fixture[];
}
export interface BundleInfo {
  description: string;
  /** Matcher names, bundles flattened. */
  members: string[];
}
export interface PlaygroundData {
  matchers: Record<string, MatcherInfo>;
  bundles: Record<string, BundleInfo>;
}

export const data: PlaygroundData = JSON.parse(document.getElementById('data')!.textContent!);

export const NEW_RULE_YAML =
  'id: my_rule\nrole: tool\nclassification: [any]\ndescription: Describe what this rule catches in a sentence or two.\npattern: ^ERROR\nbefore: 0\nafter: 3\n';

/** Rule-picker values: `m:<matcher>`, `b:<bundle>`, or '' for a new rule. */
export const ruleValue = (name: string) => (name in data.matchers ? 'm:' : 'b:') + name;

/** The editor source for a rule-picker value; a bundle is its members as YAML documents. */
export function ruleSource(value: string): string {
  const name = value.slice(2);
  if (value.startsWith('m:')) return data.matchers[name].yaml;
  if (value.startsWith('b:')) return data.bundles[name].members.map((n) => data.matchers[n].yaml.trimEnd()).join('\n---\n') + '\n';
  return NEW_RULE_YAML;
}

export const logFor = (fx: Fixture, p: Provider) => fx.logs[p] ?? fx.logs.any;

/** `<matcher>/<fixture>`, the fixture-picker value. */
export function findFixture(key: string): Fixture | undefined {
  const [matcher, name] = key.split('/');
  return data.matchers[matcher]?.fixtures.find((f) => f.name === name);
}

const byEcoThenName = ([a, ma]: [string, MatcherInfo], [b, mb]: [string, MatcherInfo]) =>
  ma.eco.localeCompare(mb.eco) || a.localeCompare(b);
const sortedMatchers = Object.entries(data.matchers).sort(byEcoThenName);

export const ruleItems: Item[] = [
  { value: '', label: 'New rule', group: '', hay: 'new rule blank' },
  ...Object.entries(data.bundles).map(([n, b]) => ({
    value: 'b:' + n, label: n, group: 'Bundles', sub: b.description, hay: `${n} bundle ${b.description}`.toLowerCase(),
  })),
  ...sortedMatchers.map(([n, m]) => ({
    value: 'm:' + n, label: n, group: `Matchers · ${m.eco}`, sub: m.description, hay: `${n} ${m.eco} ${m.description}`.toLowerCase(),
  })),
];

export const fixtureItems: Item[] = sortedMatchers.flatMap(([n, m]) =>
  m.fixtures.map((f) => ({ value: `${n}/${f.name}`, label: f.name, group: n, sub: m.eco, hay: `${n} ${m.eco} ${f.name}`.toLowerCase() })),
);
