// In-world dialogs. NEVER use window.alert/confirm/prompt (they break in Instagram/WhatsApp in-app browsers).
// Core ships the behavior (focus trap, Escape, a11y). Themes only restyle the dialog-* parts.
import { part } from './util.js';

let uid = 0;

export function createDialogs(root = document.body) {
  function open({ title, message, tone = 'info', actions, cancelValue }) {
    return new Promise((resolve) => {
      const previous = document.activeElement;
      const id = `gk-dlg-${++uid}`;
      const buttons = actions.map((a) =>
        part('button', 'dialog-button', { type: 'button', 'data-variant': a.variant || 'secondary' }, a.label));
      const dialog = part('div', 'dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, 'data-tone': tone },
        title ? part('h2', 'dialog-title', { id }, title) : null,
        part('p', 'dialog-message', {}, message),
        part('div', 'dialog-actions', {}, buttons));
      const backdrop = part('div', 'dialog-backdrop', {}, dialog);

      const close = (value) => {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        previous?.focus?.();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(cancelValue); }
        if (e.key === 'Tab') { // trap focus inside the dialog
          const i = buttons.indexOf(document.activeElement);
          e.preventDefault();
          buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
        }
      };
      buttons.forEach((b, i) => b.addEventListener('click', () => close(actions[i].value)));
      document.addEventListener('keydown', onKey, true);
      root.append(backdrop);
      (buttons[buttons.length - 1]).focus();
    });
  }

  return {
    /** Resolves true when dismissed. */
    alert: ({ title, message, tone = 'info', ok = 'OK' }) =>
      open({ title, message, tone, cancelValue: true, actions: [{ label: ok, value: true, variant: 'primary' }] }),
    /** Resolves true (confirmed) or false (cancelled). */
    confirm: ({ title, message, tone = 'info', ok = 'Yes', cancel = 'Not now' }) =>
      open({ title, message, tone, cancelValue: false, actions: [{ label: cancel, value: false }, { label: ok, value: true, variant: 'primary' }] }),
  };
}
