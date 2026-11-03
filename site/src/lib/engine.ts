// The whole matching engine, a port of ci-doctor's `core/extract.py::_windows_for`
// plus the provider framing strip. `test/parity.test.ts` holds it to every fixture.
// Erasable TypeScript only: `node --test` runs this file with no build step.

import { RE2JS } from 're2js';

export type Provider = 'github' | 'gitlab';

export interface Matcher {
  id: string;
  role?: string;
  classification?: string[];
  description?: string;
  pattern?: string;
  start?: string;
  end?: string;
  exclude?: string[];
  before?: number;
  after?: number;
}

const cache = new Map<string, RE2JS>();
function re2(rx: string): RE2JS {
  let c = cache.get(rx);
  if (!c) cache.set(rx, (c = RE2JS.compile(rx)));
  return c;
}
/** A line hits a regex if it matches anywhere in it (search, not full match). */
const hits = (rx: string, line: string) => re2(rx).matcher(line).find();

// ---------- provider framing ----------
// Log order is kept: strip the runner's framing, then the light denoise ci-doctor
// always applies (`core/denoise.py`, default config): ANSI codes and blank lines.

// github/segmenter.py: exactly one space after the timestamp; more is the tool's indent.
const GH_TS = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z? /;
const GH_STRUCT = /^##\[(?:group\].*|endgroup\]\s*)$/;
// gitlab/segmenter.py: _LOG_META and _MARKER.
const GL_META = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z [0-9A-Fa-f]{2}[OE]\+? ?/gm;
const GL_MARKER = /(?:\x1b\[0K)?section_(?:start|end):\d+:[A-Za-z0-9_.-]+(?:\[[^\]]*\])?(?:\r(?:\x1b\[0K)?)?\n?/g;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export interface Line {
  text: string;
  /** Index into `Prepared.display`. */
  pos: number;
}
export interface Prepared {
  /** The log as the provider shows it: framing stripped. `structure` lines are never matched. */
  display: { text: string; structure: boolean }[];
  /** What matchers see: the non-blank content lines of `display`. */
  lines: Line[];
}

export function prepare(raw: string, provider: Provider): Prepared {
  const text = raw.replace(/\r\n/g, '\n'); // a lone \r is GitLab's marker terminator
  const parts =
    provider === 'github'
      ? text.split('\n').map((l) => l.replace(GH_TS, ''))
      : text.replace(GL_META, '').replace(GL_MARKER, '').split('\n').map((l) => l.replace(/\r+$/, ''));
  if (parts.at(-1) === '') parts.pop();
  const display = parts.map((l) => {
    const t = l.replace(ANSI, '');
    return { text: t, structure: provider === 'github' && GH_STRUCT.test(t) };
  });
  const lines = display.flatMap((l, pos) => (!l.structure && /\S/.test(l.text) ? [{ text: l.text, pos }] : []));
  return { display, lines };
}

// ---------- matching ----------

export interface Result {
  /** Anchor line indexes. */
  anchors: number[];
  /** Highlighted ranges, half-open `[start, end)`, one per anchor/block, unmerged. */
  windows: [number, number][];
}

/** Port of `_windows_for` for one matcher. Throws if a regex does not compile. */
export function run(lines: string[], m: Matcher): Result {
  const exclude = m.exclude ?? [];
  const anchorRx = (m.pattern || m.start) as string;
  const anchors = lines.flatMap((l, i) => (hits(anchorRx, l) && !exclude.some((x) => hits(x, l)) ? [i] : []));
  const windows: [number, number][] = [];
  if (!m.end) {
    for (const i of anchors) windows.push([Math.max(0, i - (m.before ?? 0)), Math.min(lines.length, i + (m.after ?? 0) + 1)]);
    return { anchors, windows };
  }
  let resume = 0; // a block's scan resumes after its end, so blocks never nest
  const kept: number[] = [];
  for (const i of anchors) {
    if (i < resume) continue;
    let j = lines.length; // no end found: the block runs to the end of the log
    for (let k = i + 1; k < lines.length; k++) if (hits(m.end, lines[k])) { j = k; break; }
    resume = Math.min(lines.length, j + 1);
    windows.push([i, resume]);
    kept.push(i);
  }
  return { anchors: kept, windows };
}

/** Indexes of every highlighted line, ascending. */
export function highlighted(r: Result): number[] {
  const s = new Set<number>();
  for (const [a, b] of r.windows) for (let i = a; i < b; i++) s.add(i);
  return [...s].sort((a, b) => a - b);
}

// ---------- validation (registry rules, as far as the browser can check) ----------

const rxErr = (name: string, rx: unknown): string | null => {
  if (typeof rx !== 'string' || !rx) return `${name} must be a non-empty string`;
  try {
    if (re2(rx).matcher('').find()) return `${name} matches an empty line`;
  } catch (e) {
    return `${name} does not compile in RE2: ${(e as Error).message}`;
  }
  return null;
};

export function validate(m: Matcher): string[] {
  const errs: (string | null)[] = [];
  const forms = [m.pattern !== undefined, m.start !== undefined || m.end !== undefined];
  if (forms[0] === forms[1]) errs.push('use exactly one form: `pattern`, or `start` + `end`');
  else if (forms[0]) errs.push(rxErr('pattern', m.pattern));
  else {
    errs.push(rxErr('start', m.start), rxErr('end', m.end));
    if (m.before !== undefined || m.after !== undefined) errs.push('`before`/`after` only apply to `pattern`');
  }
  for (const k of ['before', 'after'] as const) {
    const v = m[k];
    if (v !== undefined && !(Number.isInteger(v) && v >= 0 && v <= 100)) errs.push(`${k} must be an integer 0-100`);
  }
  if (m.exclude !== undefined && !Array.isArray(m.exclude)) errs.push('exclude must be a list of regexes');
  else (m.exclude ?? []).forEach((x, i) => {
    try { re2(x); } catch (e) { errs.push(`exclude[${i}] does not compile in RE2: ${(e as Error).message}`); }
  });
  const d = m.description;
  if (typeof d !== 'string' || !/^[\x20-\x7e]{20,250}$/.test(d)) errs.push('description must be printable ASCII, 20-250 characters');
  if (!m.id) errs.push('id is required');
  if (!['tool', 'wrapper', 'fallback'].includes(m.role as string)) errs.push('role must be tool, wrapper or fallback');
  return errs.filter((e): e is string => !!e);
}

// ---------- fixtures ----------

/** Lines of a `.expected` file with the `… [N lines elided] …` gap markers removed. */
export function expectedLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').filter((l) => !/^… \[\d+ lines? elided\] …$/.test(l));
}
