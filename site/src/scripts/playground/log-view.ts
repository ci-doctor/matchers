// The output pane: the log as the provider shows it, matched lines marked.
import { escapeHtml } from '../../lib/html.ts';
import type { Prepared } from '../../lib/engine.ts';
import type { LineMark } from './matches.ts';

const lineHtml = (n: number, text: string, cls = '', attrs = '') =>
  `<div class="ln${cls}" id="L${n}"${attrs}><i>${n}</i>${escapeHtml(text)}</div>`;

export function renderEmpty(out: HTMLElement) {
  out.innerHTML = '<p class="empty">Paste a log, drop a file or load a fixture to see matches.</p>';
}

export function renderRaw(out: HTMLElement, raw: string) {
  out.innerHTML = raw.split('\n').map((text, i) => lineHtml(i + 1, text)).join('');
}

export function renderMarked(out: HTMLElement, prep: Prepared, marks: Map<number, LineMark>) {
  out.innerHTML = prep.display.map((line, i) => {
    const mark = marks.get(i);
    const cls = (line.structure ? ' structure' : '') + (mark ? ' hit' : '') + (mark?.anchor ? ' anchor' : '');
    const attrs = mark ? ` style="--hl:${mark.colour}" title="${escapeHtml(mark.by.join(', '))}"` : '';
    return lineHtml(i + 1, line.text, cls, attrs);
  }).join('');
}

/** Start at the first match, not the runner preamble. */
export function scrollToFirstHit(out: HTMLElement) {
  const hit = out.querySelector<HTMLElement>('.hit');
  if (hit) out.scrollTop = hit.offsetTop - out.offsetTop - 40;
}

/** Bring a 1-based display line into view and flash it. */
export function revealLine(n: number) {
  const el = document.getElementById('L' + n);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}
