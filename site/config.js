// The storefront's settings. Change the brand here; nothing else in the site hardcodes it.
export const config = {
  brand: 'Fondly',
  // The backend: the address of the deployed Apps Script web app (backend/README.md), ending in /exec.
  // Leave it empty for DEMO MODE: the whole flow works, but nothing is paid, stored or sent.
// (This address is public by design: the page has to call it. What protects the backend is its own checks, not hiding the address.)
  api: 'https://script.google.com/macros/s/AKfycbz63KsfASTXvuiKKt59NCZdDKDxOGALSyeBM8e9Nux6D0Z6rTkcDX7sKWdXAyNRYdh0hg/exec',
  // How the gift link reaches the customer. Email always works (the backend sends it). Turn whatsapp on only once a WhatsApp sender is wired
  // into the backend: it makes the mobile number required and the screens say "WhatsApp".
  delivery: { whatsapp: false },
};
