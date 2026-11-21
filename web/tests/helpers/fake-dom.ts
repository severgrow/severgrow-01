// A tiny, honest DOM for the skin-picker tests (the suite runs in node; no jsdom here). It supports
// exactly what the picker builds and marks: elements, attributes, classes, simple selectors and the
// append/insertBefore/parent wiring. Nothing here pretends to lay out or animate.
export type FakeEl = {
  nodeType: number;
  tag: string;
  id: string;
  className: string;
  textContent: string;
  hidden: boolean;
  dataset: Record<string, string>;
  style: Record<string, string>;
  attrs: Record<string, string>;
  children: FakeEl[];
  parentElement: FakeEl | null;
  append(...nodes: FakeEl[]): void;
  appendChild(node: FakeEl): void;
  insertBefore(node: FakeEl, before: FakeEl | null): void;
  setAttribute(key: string, value: string): void;
  getAttribute(key: string): string | null;
  removeAttribute(key: string): void;
  addEventListener(name: string, handler: (event: unknown) => void): void;
  classList: {
    toggle(name: string, on?: boolean): void;
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  };
  focus(options?: unknown): void;
  closest(selector: string): FakeEl | null;
  querySelector(selector: string): FakeEl | null;
  querySelectorAll(selector: string): FakeEl[];
};

const classes = (node: FakeEl): string[] => node.className.split(/\s+/).filter(Boolean);
const syncClass = (node: FakeEl, names: Set<string>) => { node.className = [...names].join(' '); };

/** Supports `#id`, `.class`, `tag`, `[data-x]`, `[data-x="v"]`, `tag.class`, `.class[data-x="v"]`. */
export const matches = (node: FakeEl, selector: string): boolean => {
  const raw = selector.trim();
  const id = /^#([\w-]+)$/.exec(raw);
  if (id) return node.id === id[1];
  const attrOnly = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(raw);
  if (attrOnly) {
    const value = attrValue(node, attrOnly[1]!);
    return attrOnly[2] === undefined ? value !== undefined : value === attrOnly[2];
  }
  const compound = /^([a-z][\w-]*)?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(raw);
  if (!compound) return false;
  const [, tag, classPart = '', attr, attrValueWanted] = compound;
  if (tag && node.tag !== tag) return false;
  for (const name of classPart.split('.').filter(Boolean)) {
    if (!classes(node).includes(name)) return false;
  }
  if (attr) {
    const value = attrValue(node, attr);
    if (attrValueWanted === undefined ? value === undefined : value !== attrValueWanted) return false;
  }
  return true;
};

const attrValue = (node: FakeEl, name: string): string | undefined => {
  if (name.startsWith('data-')) return node.dataset[name.slice(5)];
  return node.attrs[name];
};

const descendants = (node: FakeEl): FakeEl[] => node.children.flatMap((child) => [child, ...descendants(child)]);

export const makeEl = (tag: string): FakeEl => {
  const el = {
    nodeType: 1,
    tag,
    id: '',
    className: '',
    textContent: '',
    hidden: false,
    dataset: {},
    style: {},
    attrs: {},
    children: [],
    parentElement: null,
  } as unknown as FakeEl;
  const attach = (node: FakeEl) => { node.parentElement = el; };
  el.append = (...nodes: FakeEl[]) => { nodes.forEach(attach); el.children.push(...nodes); };
  el.appendChild = (node: FakeEl) => { attach(node); el.children.push(node); };
  el.insertBefore = (node: FakeEl, before: FakeEl | null) => {
    attach(node);
    const at = before ? el.children.indexOf(before) : -1;
    if (at < 0) el.children.push(node);
    else el.children.splice(at, 0, node);
  };
  el.setAttribute = (key: string, value: string) => {
    el.attrs[key] = value;
    if (key === 'id') el.id = value;
    if (key.startsWith('data-')) el.dataset[key.slice(5)] = value;
  };
  el.getAttribute = (key: string) => (key === 'id' ? el.id || null : attrValue(el, key) ?? null);
  el.removeAttribute = (key: string) => { delete el.attrs[key]; if (key.startsWith('data-')) delete el.dataset[key.slice(5)]; };
  el.addEventListener = () => undefined;
  el.classList = {
    toggle: (name, on) => {
      const names = new Set(classes(el));
      const want = on ?? !names.has(name);
      if (want) names.add(name); else names.delete(name);
      syncClass(el, names);
    },
    add: (name) => { const names = new Set(classes(el)); names.add(name); syncClass(el, names); },
    remove: (name) => { const names = new Set(classes(el)); names.delete(name); syncClass(el, names); },
    contains: (name) => classes(el).includes(name),
  };
  el.focus = () => undefined;
  el.closest = (selector) => {
    let node: FakeEl | null = el;
    while (node) { if (matches(node, selector)) return node; node = node.parentElement; }
    return null;
  };
  el.querySelector = (selector) => descendants(el).find((node) => matches(node, selector)) ?? null;
  el.querySelectorAll = (selector) => descendants(el).filter((node) => matches(node, selector));
  return el;
};

export type FakeDocument = FakeEl & { head: FakeEl; body: FakeEl; createElement: (tag: string) => FakeEl; getElementById: (id: string) => FakeEl | null; addEventListener: () => void; removeEventListener: () => void };

/** Install `document`/`window` for one test file. Call it before importing the modules under test. */
export const installFakeDom = (): { document: FakeDocument; window: { addEventListener: () => void }; pane: () => FakeEl } => {
  const head = makeEl('head');
  const body = makeEl('body');
  const document = makeEl('document') as unknown as FakeDocument;
  (document as unknown as { head: FakeEl }).head = head;
  (document as unknown as { body: FakeEl }).body = body;
  (document as unknown as { createElement: (tag: string) => FakeEl }).createElement = makeEl;
  (document as unknown as { getElementById: (id: string) => FakeEl | null }).getElementById =
    (id) => [head, body].flatMap(descendants).find((node) => node.id === id) ?? null;
  (document as unknown as { addEventListener: () => void }).addEventListener = () => undefined;
  (document as unknown as { removeEventListener: () => void }).removeEventListener = () => undefined;
  const win = { addEventListener: () => undefined };
  (globalThis as { document?: unknown }).document = document;
  (globalThis as { window?: unknown }).window = win;
  return { document, window: win, pane: () => makeEl('div') };
};

export const descendantsOf = descendants;
