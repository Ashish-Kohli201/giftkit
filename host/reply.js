// The end of a gift: a small card where the person who got it can write back to the sender, and a quiet "make your own gift" link.
// Text only (nothing here is ever built from HTML). It appears after the gift has finished, never over it.
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...kids.filter((k) => k != null && k !== false));
  return node;
};

/**
 * @param opts.sender   the sender's name (for "Send a message back to ...")
 * @param opts.name     what to prefill as the reader's own name
 * @param opts.send     async ({ message, name }) -> resolves when sent, throws Error(message) to show a problem
 * @param opts.shopHref where "make your own gift" goes
 * @param opts.brand    the shop's name
 */
export function showReply({ sender, name, send, shopHref, brand }) {
  const to = sender || 'the sender';
  const message = el('textarea', { class: 'reply-text', rows: 4, maxlength: 600, placeholder: 'Say something nice...', 'aria-label': `Your message to ${to}` });
  const who = el('input', { class: 'reply-name', type: 'text', maxlength: 40, placeholder: 'Your name', 'aria-label': 'Your name', value: name || '' });
  const problem = el('p', { class: 'reply-problem', role: 'alert' });
  const submit = el('button', { class: 'reply-send', type: 'button' }, 'Send');
  const later = el('button', { class: 'reply-later', type: 'button' }, 'Not now');
  const make = el('a', { class: 'reply-make', href: shopHref }, 'Make your own gift');

  const card = el('section', { class: 'reply', 'aria-label': `Send a message back to ${to}` },
    el('h2', {}, `Send a message back to ${to}`),
    message, who, problem,
    el('div', { class: 'reply-actions' }, later, submit),
    make);

  const close = () => { card.dataset.state = 'out'; setTimeout(() => { card.remove(); tail.hidden = false; }, 350); };
  // after the card is gone (sent or dismissed) only a very small, quiet link stays at the bottom of the gift
  const tail = el('a', { class: 'reply-tail', href: shopHref, hidden: true }, `Make your own gift with ${brand}`);

  later.addEventListener('click', close);
  submit.addEventListener('click', async () => {
    const text = message.value.trim();
    if (!text) { problem.textContent = 'Write a message first.'; message.focus(); return; }
    problem.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Sending...';
    try {
      await send({ message: text, name: who.value.trim() });
      card.replaceChildren(el('h2', {}, 'Sent.'), el('p', { class: 'reply-thanks' }, `${to} will see it.`), make);
      setTimeout(close, 4500);
    } catch (e) {
      problem.textContent = e.message || 'That did not send. Please try again.';
      submit.disabled = false;
      submit.textContent = 'Send';
    }
  });

  document.body.append(card, tail);
  requestAnimationFrame(() => { card.dataset.state = 'in'; });
}
