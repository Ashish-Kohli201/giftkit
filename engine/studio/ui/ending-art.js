// Small drawings for the four ending styles, so the owner can tell them apart at a glance. Trusted constant SVG, parsed once;
// colours come from the studio's CSS variables, so they follow light and dark.
const ART = {
  scroll: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" aria-hidden="true"><rect x="8" y="6" width="144" height="88" rx="8" fill="var(--surface-2)" stroke="var(--line-strong)"/>
    <rect x="44" y="16" width="72" height="8" rx="4" fill="var(--accent)"/><rect x="30" y="34" width="100" height="5" rx="2.5" fill="var(--line-strong)"/>
    <rect x="36" y="46" width="88" height="5" rx="2.5" fill="var(--line-strong)"/><rect x="32" y="58" width="96" height="5" rx="2.5" fill="var(--line-strong)"/>
    <rect x="52" y="72" width="26" height="14" rx="2" fill="var(--accent-line)"/><rect x="82" y="72" width="26" height="14" rx="2" fill="var(--accent-line)"/>
    <path d="M80 94l-6-7h12z" fill="var(--accent)" opacity=".7"/></svg>`,
  envelope: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" aria-hidden="true"><rect x="10" y="22" width="140" height="68" rx="6" fill="var(--surface-2)" stroke="var(--line-strong)"/>
    <path d="M10 28l70 40 70-40" fill="none" stroke="var(--line-strong)" stroke-width="2"/><path d="M10 28l70 40 70-40V24a6 6 0 00-6-6H16a6 6 0 00-6 6z" fill="var(--accent-soft)" stroke="var(--accent-line)"/>
    <circle cx="80" cy="56" r="9" fill="var(--accent)"/><path d="M80 51l1.8 3.7 4 .6-2.9 2.8.7 4L80 60l-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="var(--accent-ink)"/></svg>`,
  slideshow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" aria-hidden="true"><rect x="8" y="8" width="144" height="76" rx="6" fill="var(--ink)" opacity=".88"/>
    <rect x="16" y="16" width="128" height="60" rx="3" fill="var(--accent-line)"/><circle cx="108" cy="36" r="9" fill="var(--accent-soft)"/><path d="M16 76l36-30 28 22 18-14 46 22z" fill="var(--accent)" opacity=".75"/>
    <rect x="14" y="90" width="132" height="4" rx="2" fill="var(--line-strong)"/><rect x="14" y="90" width="64" height="4" rx="2" fill="var(--accent)"/></svg>`,
  cake: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" aria-hidden="true"><rect x="38" y="56" width="84" height="30" rx="5" fill="var(--accent-line)"/><rect x="50" y="38" width="60" height="22" rx="5" fill="var(--accent)"/>
    <path d="M38 58q10 8 21 0t21 0 21 0 21 0" fill="none" stroke="var(--accent-soft)" stroke-width="4" stroke-linecap="round"/>
    <g fill="var(--ink)"><rect x="62" y="24" width="4" height="14"/><rect x="78" y="24" width="4" height="14"/><rect x="94" y="24" width="4" height="14"/></g>
    <g fill="#ffb347"><path d="M64 14q4 6 0 9-4-3 0-9z"/><path d="M80 14q4 6 0 9-4-3 0-9z"/><path d="M96 14q4 6 0 9-4-3 0-9z"/></g></svg>`,
};

/** A fresh <svg> node for a style: 'scroll' | 'envelope' | 'slideshow' | 'cake'. */
export function endingArt(style) {
  const doc = new DOMParser().parseFromString(ART[style] ?? ART.scroll, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}
