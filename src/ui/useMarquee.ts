import { useEffect } from 'react';

// Text that doesn't fit and would end in "…" slides sideways instead, so the whole thing can be read.
// It watches the page for single-line elements styled with text-overflow: ellipsis and animates them
// with text-indent (see .marquee in styles.css). Nothing to add per element.

const CANDIDATES = 'b, small, span, p, em, strong, h3, h4';
const seen = new WeakMap<Element, { text: string; width: number }>();

function scan() {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(CANDIDATES))) {
    const text = el.textContent ?? '';
    const prev = seen.get(el);
    const width = el.clientWidth;
    if (prev && prev.text === text && prev.width === width) continue;
    // Quick geometry check first; only truncated text needs the style lookup.
    const marquee = el.classList.contains('marquee');
    if (!marquee && el.scrollWidth <= width + 1) { seen.set(el, { text, width }); continue; }
    if (marquee) {
      el.classList.remove('marquee');
      el.style.removeProperty('--marquee-shift');
    }
    const overflow = el.scrollWidth - el.clientWidth;
    seen.set(el, { text, width: el.clientWidth });
    if (overflow <= 1) continue;
    const style = getComputedStyle(el);
    if (style.textOverflow !== 'ellipsis' || style.whiteSpace !== 'nowrap') continue;
    el.style.setProperty('--marquee-shift', `${overflow + 6}px`);
    el.style.setProperty('--marquee-time', `${Math.max(4, overflow / 24 + 3)}s`);
    el.classList.add('marquee');
  }
}

export function useMarquee() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 300);
    };
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', later);
    later();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', later);
      window.clearTimeout(timer);
    };
  }, []);
}
