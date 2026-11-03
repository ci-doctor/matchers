// The log the rules run on: pasted, dropped/browsed as a file, or a registry fixture.
// A loaded fixture stays "attached" until the user edits the text, so switching provider
// swaps in that fixture's other log; only providers it has a log for are enabled.
import { escapeHtml } from '../../lib/html.ts';
import type { Provider } from '../../lib/engine.ts';
import { combo } from './combo.ts';
import { fixtureItems, findFixture, logFor, type Fixture } from './data.ts';

const PROVIDERS = ['github', 'gitlab'] as const;
const PROVIDER_NAME = { github: 'GitHub', gitlab: 'GitLab' } as const;
const other = (p: Provider): Provider => (p === 'github' ? 'gitlab' : 'github');
const providerRadio = (p: Provider) => document.querySelector<HTMLInputElement>(`input[name=prov][value=${p}]`)!;

export interface Renderer {
  render(opts?: { scrollToFirst?: boolean }): void;
  renderSoon(): void;
}

export function createLogInput(textarea: HTMLTextAreaElement, { render, renderSoon }: Renderer) {
  let fixture: Fixture | null = null;
  const fixtureBox = combo(document.getElementById('fixture')!, fixtureItems, (key) => {
    loadFixture(key);
    render({ scrollToFirst: true });
  });

  const provider = () => document.querySelector<HTMLInputElement>('input[name=prov]:checked')!.value as Provider;

  /** Enable only the providers the attached fixture has a log for; the user's own text enables both. */
  function updateProviders() {
    for (const p of PROVIDERS) {
      const ok = !fixture || !!logFor(fixture, p);
      const input = providerRadio(p);
      input.disabled = !ok;
      input.setAttribute('aria-disabled', String(!ok));
      input.closest('label')!.title = ok ? '' : `No ${PROVIDER_NAME[p]} log for this fixture`;
    }
  }

  function loadFixture(key: string) {
    const fx = findFixture(key);
    if (!fx) return false;
    fixture = fx;
    const p = logFor(fx, provider()) ? provider() : other(provider());
    providerRadio(p).checked = true;
    updateProviders();
    textarea.value = logFor(fx, p)!;
    fixtureBox.set(key);
    return true;
  }

  function detach() {
    fixture = null;
    fixtureBox.set('');
    updateProviders();
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    textarea.value = await file.text();
    detach();
    document.getElementById('dzt')!.innerHTML = `<b>${escapeHtml(file.name)}</b> · drop or browse to replace`;
    render();
  }

  textarea.addEventListener('input', () => { detach(); renderSoon(); });
  for (const p of PROVIDERS) providerRadio(p).addEventListener('change', () => {
    const log = fixture && logFor(fixture, provider());
    if (log) textarea.value = log;
    render({ scrollToFirst: !!log });
  });
  document.getElementById('file')!.addEventListener('change', (e) => readFile((e.target as HTMLInputElement).files?.[0]));
  for (const el of [document.getElementById('dz')!, textarea]) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop');
      readFile((e as DragEvent).dataTransfer?.files[0]);
    });
  }

  return {
    get raw() { return textarea.value; },
    provider,
    /** `<matcher>/<fixture>`; false if there is no such fixture. */
    loadFixture,
  };
}
