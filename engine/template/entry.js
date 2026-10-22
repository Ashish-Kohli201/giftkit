// Gift page entry: load the gift's own config and start it. Nothing else happens here.
import { startGift } from './core/runtime.js';

const root = document.getElementById('gift-root');
try {
  const config = await (await fetch('./gift.json')).json();
  await startGift({ root, config, base: location.href });
} catch (error) {
  root.textContent = 'This gift could not be opened. Please reload the page.';
  console.error(error);
}
