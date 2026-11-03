// The "Matches" list: one entry per window, coloured like its lines; a click jumps to them.
import { escapeHtml } from '../../lib/html.ts';
import type { MatchWindow } from './matches.ts';

export function renderMatchList(list: HTMLElement, windows: MatchWindow[], ruleCount: number) {
  const empty = ruleCount ? 'No matches.' : 'Fix the rule to see matches.';
  list.innerHTML = windows.length
    ? windows.map((w) =>
        `<li><span class="sw" style="--hl:${w.colour}"></span><a data-line="${w.first}">${escapeHtml(w.rule)} · lines ${w.first}–${w.last}</a></li>`,
      ).join('')
    : `<li class="legend">${empty}</li>`;
}

export function onMatchClick(list: HTMLElement, jump: (line: number) => void) {
  list.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-line]');
    if (a) jump(+a.dataset.line!);
  });
}
