// The editor source -> the valid rules in it, plus every error and the lines they point at.
import { parseAllDocuments, type Document } from 'yaml';
import { validate, type Matcher } from '../../lib/engine.ts';

export interface ParsedRules {
  rules: Matcher[];
  errors: string[];
  /** 0-based source lines to mark as wrong. */
  badLines: Set<number>;
}

const FORM_KEYS = ['pattern', 'start', 'end'];

export function parseRules(src: string): ParsedRules {
  const out: ParsedRules = { rules: [], errors: [], badLines: new Set() };
  const lineAt = (offset: number) => src.slice(0, offset).split('\n').length - 1;
  const docs = parseAllDocuments(src).filter((d) => d.contents !== null || d.errors.length);

  for (const [i, doc] of docs.entries()) {
    const prefix = docs.length > 1 ? `rule ${i + 1}: ` : '';
    if (doc.errors.length) {
      for (const e of doc.errors) {
        out.errors.push(prefix + e.message.split('\n')[0]);
        out.badLines.add(e.linePos ? e.linePos[0].line - 1 : lineAt(e.pos[0]));
      }
      continue;
    }
    const topLine = lineAt(doc.range[0]);
    const m = doc.toJS() as Matcher;
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      out.errors.push(prefix + 'a rule must be a YAML mapping');
      out.badLines.add(topLine);
      continue;
    }
    const keyLines = keyLineMap(doc, lineAt);
    const errs = validate(m);
    for (const e of errs) {
      out.errors.push(`${m.id ? m.id + ': ' : prefix}${e}`);
      for (const line of linesFor(e, keyLines, topLine)) out.badLines.add(line);
    }
    if (!errs.length) out.rules.push(m);
  }
  return out;
}

/** Top-level key -> the line it sits on. */
function keyLineMap(doc: Document, lineAt: (offset: number) => number): Map<string, number> {
  const map = new Map<string, number>();
  const items = (doc.contents as { items?: { key?: { value?: unknown; range?: number[] } }[] }).items ?? [];
  for (const it of items) if (it.key?.range) map.set(String(it.key.value), lineAt(it.key.range[0]));
  return map;
}

/** Where a validation message points: the line of the key it names, else the rule's first line. */
function linesFor(error: string, keyLines: Map<string, number>, topLine: number): number[] {
  if (error.startsWith('use exactly one form')) {
    const present = FORM_KEYS.filter((k) => keyLines.has(k)).map((k) => keyLines.get(k)!);
    return present.length ? present : [topLine];
  }
  const key = /^`?(\w+)/.exec(error)?.[1] ?? '';
  return [keyLines.get(key) ?? topLine];
}
