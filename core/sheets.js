// Sheets: the container an element opens in (full-screen on phones, centered card on desktop).
// Shared by every shell so a theme only has to decide how the *map* looks, not re-implement open/close.
// Themes restyle: sheet-backdrop, sheet, sheet-header, sheet-title, sheet-close, sheet-body, finale.
import { part, reducedMotion } from './util.js';

export function createSheets(root) {
  function open(kind, { title = '' } = {}) {
    const previous = document.activeElement;
    const isFinale = kind === 'finale';
    const body = part('div', 'sheet-body', { tabindex: '-1' });
    const closeBtn = part('button', 'sheet-close', { type: 'button', 'aria-label': 'Close' }, '×');
    const sheet = part(
      'section', isFinale ? 'finale' : 'sheet',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Gift', 'data-state': 'enter' },
      isFinale ? null : part('header', 'sheet-header', {}, part('h2', 'sheet-title', {}, title), closeBtn),
      body,
    );
    const backdrop = part('div', 'sheet-backdrop', { 'data-state': 'enter' }, sheet);
    root.append(backdrop);
    requestAnimationFrame(() => requestAnimationFrame(() => { backdrop.dataset.state = 'open'; sheet.dataset.state = 'open'; }));

    let closed = false;
    const onClose = [];
    const onKey = (e) => {
      if (e.key === 'Escape' && !isFinale && !document.querySelector('[data-part="dialog"]')) close();
    };
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      backdrop.dataset.state = 'closing';
      sheet.dataset.state = 'closing';
      const end = () => { backdrop.remove(); previous?.focus?.(); onClose.forEach((f) => f()); };
      if (reducedMotion()) end(); else setTimeout(end, 300);
    }
    document.addEventListener('keydown', onKey);
    closeBtn.addEventListener('click', close);
    (isFinale ? body : closeBtn).focus({ preventScroll: true });
    return { container: body, close, onClose: (fn) => onClose.push(fn) };
  }

  return {
    present: (_id, opts) => open('sheet', opts),
    presentFinale: (opts) => open('finale', opts),
  };
}
