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
// ci-doctor's segmenters split a log into a tree of sections and the extractor reads
// the tree depth-first, so matchers see lines in *section* order, not log order (a
// GitHub step's trailing output can land before its header block). We mirror that
// order so a window selects the same lines; the page maps them back to log positions.

// github/segmenter.py: exactly one space after the timestamp; more is the tool's indent.
const GH_TS = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z? /;
const GH_GROUP = /^##\[group\](.*)$/;
const GH_ENDGROUP = /^##\[endgroup\]\s*$/;
const GH_STEP_DONE = /^##\[error\]Process completed with exit code|^Post job cleanup\.|^Cleaning up orphan processes/;
const GH_STEPS = new Set(['checkout', 'restore_cache', 'download_artifacts', 'setup_job', 'setup', 'post', 'complete_job', 'run']);
// gitlab/segmenter.py: _LOG_META and _MARKER.
const GL_META = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z [0-9A-Fa-f]{2}[OE]\+? ?/gm;
const GL_MARKER = /(?:\x1b\[0K)?section_(start|end):\d+:([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?(?:\r(?:\x1b\[0K)?)?\n?/g;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export interface Line {
  text: string;
  /** Index into `Prepared.display`. */
  pos: number;
}
export interface Prepared {
  /** The log as the provider shows it: framing stripped, in log order. */
  display: { text: string; structure: boolean }[];
  /** What matchers see, in ci-doctor's section order. */
  lines: Line[];
}

interface Section {
  lines: Line[];
  children: Section[];
}
const sec = (): Section => ({ lines: [], children: [] });
const walk = (secs: Section[]): Line[] => secs.flatMap((s) => [...s.lines, ...walk(s.children)]);

function canonical(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.includes('checkout')) return 'checkout';
  if (n.includes('cache')) return 'restore_cache';
  if (n.includes('download') && n.includes('artifact')) return 'download_artifacts';
  if (n.startsWith('set up job')) return 'setup_job';
  if (n.startsWith('set up ') || n.includes('setup-')) return 'setup';
  if (n.startsWith('post ')) return 'post';
  if (n.startsWith('complete job')) return 'complete_job';
  if (n.startsWith('run ')) return 'run';
  return name.trim();
}

function segmentGithub(text: string, display: Prepared['display']): Section[] {
  const top: Section[] = [];
  const outside: Record<string, Section> = {};
  let nested: Section[] = [];
  let current: Section | null = null;
  let seenGroup = false;
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const physical of lines) {
    const t = physical.replace(GH_TS, '').replace(ANSI, '');
    const pos = display.length;
    const group = GH_GROUP.exec(t);
    display.push({ text: t, structure: !!group || GH_ENDGROUP.test(t) });
    if (group) {
      seenGroup = true;
      const s = sec();
      if (GH_STEPS.has(canonical(group[1]))) {
        nested = [];
        current = s;
        top.push(s);
      } else if (current) {
        (nested.at(-1) ?? current).children.push(s);
        nested.push(s);
      } else {
        top.push(s);
        nested.push(s);
      }
    } else if (GH_ENDGROUP.test(t)) {
      nested.pop();
    } else {
      if (GH_STEP_DONE.test(t) && current && !nested.length) current = null;
      const name = seenGroup ? 'trailer' : 'preamble';
      if (!outside[name] && !nested.length && !current) top.push((outside[name] = sec()));
      (nested.at(-1) ?? current ?? outside[name]).lines.push({ text: t, pos });
    }
  }
  return top;
}

function segmentGitlab(raw: string, display: Prepared['display']): Section[] {
  const top: Section[] = [];
  const outside: Record<string, Section> = {};
  const stack: Section[] = [];
  const named = new Map<Section, string>();
  let seenStart = false;
  const emit = (run: string) => {
    const parts = run.split('\n');
    if (parts.at(-1) === '') parts.pop();
    let target = stack.at(-1);
    if (!target) {
      const name = seenStart ? 'trailer' : 'preamble';
      if (!outside[name]) top.push((outside[name] = sec()));
      target = outside[name];
    }
    for (const part of parts) {
      const t = part.replace(/\r+$/, '').replace(ANSI, '');
      target.lines.push({ text: t, pos: display.length });
      display.push({ text: t, structure: false });
    }
  };
  let pos = 0;
  for (const m of raw.matchAll(GL_MARKER)) {
    if (m.index > pos) emit(raw.slice(pos, m.index));
    if (m[1] === 'start') {
      seenStart = true;
      const s = sec();
      (stack.at(-1)?.children ?? top).push(s);
      named.set(s, m[2]);
      stack.push(s);
    } else {
      const i = stack.findLastIndex((s) => named.get(s) === m[2]);
      if (i >= 0) stack.length = i; // also drops unclosed sections nested above it
    }
    pos = m.index + m[0].length;
  }
  if (pos < raw.length) emit(raw.slice(pos));
  return top;
}

/**
 * Strip a provider's framing and order the lines the way ci-doctor does, then apply
 * the denoise ci-doctor always runs (`core/denoise.py`, default config): ANSI codes
 * stripped, blank lines dropped (`noise_patterns: ['^\s*$']`). Repeat folding and
 * `\r` collapsing are not ported.
 */
export function prepare(raw: string, provider: Provider): Prepared {
  const text = raw.replace(/\r\n/g, '\n'); // a lone \r is GitLab's marker terminator
  const display: Prepared['display'] = [];
  const tree = provider === 'github' ? segmentGithub(text, display) : segmentGitlab(text.replace(GL_META, ''), display);
  return { display, lines: walk(tree).filter((l) => /\S/.test(l.text)) };
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
