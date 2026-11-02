// A small accessible combobox (ARIA 1.2 list autocomplete): type to filter, arrows,
// Enter, Esc. Items are grouped; filtering is a substring match over `hay`.

export interface Item {
  value: string;
  label: string;
  group: string;
  hay: string;
  sub?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
let uid = 0;

export function combo(root: HTMLElement, items: Item[], onPick: (value: string) => void) {
  const id = `cb${uid++}`;
  root.innerHTML = `<input type="text" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(root.dataset.placeholder ?? '')}" aria-label="${esc(root.dataset.label ?? '')}"><ul id="${id}" role="listbox" hidden></ul>`;
  const input = root.querySelector('input')!;
  const list = root.querySelector('ul')!;
  let shown: Item[] = [];
  let active = -1;
  let current: Item | undefined;

  const isOpen = () => !list.hidden;
  const setOpen = (o: boolean) => { list.hidden = !o; input.setAttribute('aria-expanded', String(o)); if (!o) input.removeAttribute('aria-activedescendant'); };
  const mark = () => {
    list.querySelectorAll('[role=option]').forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === active));
      if (i === active) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    });
  };
  function draw(q: string) {
    const t = q.trim().toLowerCase();
    shown = items.filter((i) => !t || i.hay.includes(t));
    let html = '';
    let g: string | null = null;
    shown.forEach((it, i) => {
      if (it.group !== g) { g = it.group; if (g) html += `<li role="presentation" class="grp">${esc(g)}</li>`; }
      html += `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="false">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</li>`;
    });
    list.innerHTML = html || '<li role="presentation" class="none">No match</li>';
    active = t ? (shown.length ? 0 : -1) : shown.indexOf(current as Item);
    mark();
  }
  const restore = () => { input.value = current?.label ?? ''; };
  function pick(it: Item) {
    current = it;
    restore();
    setOpen(false);
    onPick(it.value);
  }

  input.addEventListener('focus', () => { input.select(); draw(''); setOpen(true); });
  input.addEventListener('blur', () => { setOpen(false); restore(); });
  input.addEventListener('input', () => { draw(input.value); setOpen(true); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { draw(''); setOpen(true); }
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      mark();
    } else if (e.key === 'Enter' && isOpen() && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      setOpen(false);
      restore();
    }
  });
  list.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep focus in the input
    const li = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
    if (li) pick(shown[+li.dataset.i!]);
  });
  restore();
  return {
    set(value: string) { current = items.find((i) => i.value === value); restore(); },
  };
}
