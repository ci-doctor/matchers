// Run every rule over a prepared log: per display line, how to mark it; per window, a match-list entry.
import { run, highlighted, type Matcher, type Prepared } from '../../lib/engine.ts';

const HUES = [48, 200, 130, 330, 20, 270, 170, 90];
const colourFor = (ruleIndex: number) => `hsl(${HUES[ruleIndex % HUES.length]} 85% 55%)`;

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

  rules.forEach((m, ruleIndex) => {
    const name = nameOf(m);
    const colour = colourFor(ruleIndex);
    const result = run(texts, m);
    const anchors = new Set(result.anchors.map(posOf));
    for (const pos of highlighted(result).map(posOf)) {
      const mark = marks.get(pos) ?? { colour, anchor: false, by: [] }; // first rule's colour wins
      mark.by.push(name);
      mark.anchor ||= anchors.has(pos);
      marks.set(pos, mark);
    }
    for (const [start, end] of result.windows) {
      const positions = prep.lines.slice(start, end).map((l) => l.pos);
      windows.push({ rule: name, colour, first: Math.min(...positions) + 1, last: Math.max(...positions) + 1 });
    }
  });
  return { marks, windows };
}
