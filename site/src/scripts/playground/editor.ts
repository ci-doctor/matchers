// The rule editor: a transparent <textarea> over a highlighted <pre>, kept in step,
// plus the validation status under it.
import { highlight } from '../../lib/yaml-highlight.ts';
import { escapeHtml } from '../../lib/html.ts';

export function createEditor(textarea: HTMLTextAreaElement, overlay: HTMLElement, status: HTMLElement) {
  const syncScroll = () => {
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  };
  textarea.addEventListener('scroll', syncScroll);

  return {
    get source() { return textarea.value; },
    set source(src: string) { textarea.value = src; },

    /** Re-highlight; `badLines` (0-based) get the error mark. */
    paint(badLines: ReadonlySet<number> = new Set()) {
      overlay.innerHTML = highlight(textarea.value, badLines);
      syncScroll();
    },

    showStatus(errors: string[], ruleCount: number) {
      status.innerHTML = errors.length
        ? `<ul class="errs">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
        : ruleCount ? '<p class="ok">Valid.</p>' : '';
    },
  };
}
