// Run every rule over a prepared log: per display line, how to mark it; per window, a match-list entry.
import { run, highlighted, type Matcher, type Prepared } from '../../lib/engine.ts';

/** Bright, well-separated hues: readable as washes on the log (dark in both themes) and as
 *  swatches on light and dark backgrounds. Ordered so neighbours differ most. */
export const PALETTE = ['#f2cc60', '#5aa9ff', '#ff5f6d', '#4cd17e', '#b48cff', '#ff9640', '#2fd3d3', '#f472d0'];

export interface LineMark {
  colour: string;
  anchor: boolean;
  /** Names of the rules that highlight this line. */
  by: string[];
}
export interface MatchWindow {
  rule: string;
  colour: string;
  /** 1-based display line numbers, inclusive. */
  first: number;
  last: number;
}
export interface Matches {
  /** Keyed by display position. */
  marks: Map<number, LineMark>;
  windows: MatchWindow[];
}

export function findMatches(prep: Prepared, rules: Matcher[], nameOf: (m: Matcher) => string): Matches {
  const texts = prep.lines.map((l) => l.text);
  const posOf = (lineIndex: number) => prep.lines[lineIndex].pos;
  const marks = new Map<number, LineMark>();
  const windows: MatchWindow[] = [];
  // One colour per matcher id, handed out in order among the rules that fire (so the
  // matchers on screen are distinct until the palette runs out, then it cycles).
  const colours = new Map<string, string>();

  for (const m of rules) {
    const result = run(texts, m);
    if (!result.windows.length) continue;
    const name = nameOf(m);
    if (!colours.has(m.id)) colours.set(m.id, PALETTE[colours.size % PALETTE.length]);
    const colour = colours.get(m.id)!;
    const anchors = new Set(result.anchors.map(posOf));
    for (const pos of highlighted(result).map(posOf)) {
      const anchor = anchors.has(pos);
      const mark = marks.get(pos);
      if (!mark) marks.set(pos, { colour, anchor, by: [name] });
      else {
        mark.by.push(name);
        if (anchor && !mark.anchor) mark.colour = colour; // a shared line shows the rule it anchors
        mark.anchor ||= anchor;
      }
    }
    for (const [start, end] of result.windows) {
      const positions = prep.lines.slice(start, end).map((l) => l.pos);
      windows.push({ rule: name, colour, first: Math.min(...positions) + 1, last: Math.max(...positions) + 1 });
    }
  }
  return { marks, windows };
}
