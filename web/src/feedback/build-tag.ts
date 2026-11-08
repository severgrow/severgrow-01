// THE PUBLISH NUMBER ON THE MENU (owner, 2026-11-08: "include the publish number like '46f8579a' just
// make it less visible"). Each publish writes the commit it built into ./BUILD_SHA beside the page; the
// beta line ends with its first 8 characters, faint. Asked for after the menu is painted (it never
// delays the first frame); a dev server, an offline start or a missing file simply shows no number.

/** The 8-character commit from the file's text, or null for anything that is not a commit. */
export const buildTagOf = (text: string | null | undefined): string | null => {
  const sha = (text ?? '').trim();
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 8) : null;
};

export const BUILD_TAG_CSS = `
#menu-beta .beta-build {
  margin-left: .5em; opacity: .42; font-size: .8em; letter-spacing: .04em;
  font-variant-numeric: tabular-nums; user-select: text;
}
`;

export const paintBuildTag = async (beta: HTMLElement | null): Promise<void> => {
  if (!beta || beta.querySelector('.beta-build') || typeof fetch !== 'function') return;
  let tag: string | null = null;
  try {
    const res = await fetch('./BUILD_SHA', { cache: 'no-cache' });
    tag = res.ok ? buildTagOf(await res.text()) : null;
  } catch {
    return;
  }
  if (!tag || beta.querySelector('.beta-build')) return;
  if (!document.getElementById('build-tag-css')) {
    const style = document.createElement('style');
    style.id = 'build-tag-css';
    style.textContent = BUILD_TAG_CSS;
    document.head.append(style);
  }
  const span = document.createElement('span');
  span.className = 'beta-build';
  span.textContent = tag;
  beta.append(span);
};
