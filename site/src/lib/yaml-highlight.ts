// A hand-rolled highlighter for matcher YAML (small, flat): keys, strings, numbers,
// list dashes, comments, and regex values (pattern/start/end/exclude items).
// Used by the matcher page, at build time.

import { escapeHtml as esc } from './html.ts';

const span = (cls: string, s: string) => (s ? `<i class="t-${cls}">${esc(s)}</i>` : '');
const RX_KEYS = new Set(['pattern', 'start', 'end']);

/** Split a line at a `#` comment that sits outside quotes. */
function splitComment(line: string): [string, string] {
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = ''; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return [line.slice(0, i), line.slice(i)];
  }
  return [line, ''];
}

function scalar(v: string, rx: boolean): string {
  const t = v.trim();
  if (!t) return esc(v);
  const lead = v.slice(0, v.indexOf(t)), trail = v.slice(v.indexOf(t) + t.length);
  const cls = rx ? 'rx' : /^-?\d+(\.\d+)?$/.test(t) ? 'num' : /^(true|false|null|~)$/.test(t) ? 'kw' : 'str';
  return esc(lead) + span(cls, t) + esc(trail);
}

function value(v: string, rx: boolean): string {
  if (/^\s*\[/.test(v)) return v.split(/([[\],])/).map((p) => (/^[[\],]$/.test(p) ? span('p', p) : scalar(p, rx))).join('');
  return scalar(v, rx);
}

/** One line of highlighted HTML. `st.ex` carries "inside an `exclude:` list" between lines. */
export function highlightLine(line: string, st: { ex: boolean }): string {
  if (/^---\s*$/.test(line)) { st.ex = false; return span('p', line); }
  const [code, comment] = splitComment(line);
  let out: string;
  let m: RegExpExecArray | null;
  if ((m = /^(\s*)(- +)?([A-Za-z_][\w.-]*)(:)(?=\s|$)(.*)$/.exec(code))) {
    st.ex = m[3] === 'exclude' && !m[5].trim();
    out = esc(m[1]) + span('p', m[2] ?? '') + span('key', m[3]) + span('p', m[4]) + value(m[5], RX_KEYS.has(m[3]) || (m[3] === 'exclude'));
  } else if ((m = /^(\s*)(- +)(.*)$/.exec(code))) {
    out = esc(m[1]) + span('p', m[2]) + value(m[3], st.ex);
  } else {
    if (code.trim()) st.ex = false;
    out = esc(code);
  }
  return out + span('c', comment);
}

/** The whole source as one block per line; `bad` lines (0-based) get the error mark. */
export function highlight(src: string, bad: ReadonlySet<number> = new Set()): string {
  const st = { ex: false };
  return src
    .split('\n')
    .map((l, i) => `<span class="l${bad.has(i) ? ' err' : ''}">${highlightLine(l, st) || '​'}</span>`)
    .join('');
}
