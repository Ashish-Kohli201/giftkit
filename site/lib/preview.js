// A phone on screen that shows a live product. It is the real thing: the host page (host/index.html) in preview mode inside an
// iframe, fed with the customer's values by postMessage (see host/host.js). The iframe is always 390 x 844, scaled to fit.
const W = 390;
const H = 844;

export function createPhone(container, { productId, skin } = {}) {
  container.classList.add('phone');
  const screen = document.createElement('div');
  screen.className = 'phone-screen';
  const frame = document.createElement('iframe');
  frame.title = 'Live preview of the gift';
  frame.width = W;
  frame.height = H;
  screen.append(frame);
  container.append(screen);

  let ready = false;
  let pending = null;
  const listeners = new Set();

  const onMessage = (e) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin || e.data?.type !== 'gift') return;
    if (e.data.event === 'ready') {
      ready = true;
      if (pending) { frame.contentWindow.postMessage(pending, location.origin); pending = null; }
    }
    listeners.forEach((fn) => fn(e.data.event));
  };
  addEventListener('message', onMessage);

  /** Scale the 390 x 844 screen into whatever room the container has. */
  const fit = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    screen.style.transform = `translate(-50%, -50%) scale(${Math.min(width / W, height / H)})`;
  };
  const ro = new ResizeObserver(fit);
  ro.observe(container);
  fit();

  function load(id, look) {
    ready = false;
    pending = null;
    frame.src = `../host/index.html?product=${encodeURIComponent(id)}&preview=1${look ? `&skin=${encodeURIComponent(look)}` : ''}`;
  }
  if (productId) load(productId, skin);

  return {
    load,
    /** Send the customer's values (and their picked files) to the live product. */
    update(options, media = {}) {
      const msg = { type: 'options', options, media };
      if (ready) frame.contentWindow.postMessage(msg, location.origin); else pending = msg;
    },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    /** Play it again from the start. */
    restart() { ready = false; frame.contentWindow.location.reload(); },
    destroy() { removeEventListener('message', onMessage); ro.disconnect(); container.replaceChildren(); },
  };
}
