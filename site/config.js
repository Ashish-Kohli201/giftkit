// The storefront's settings. Change the brand here; nothing else in the site hardcodes it.
export const config = {
  brand: 'Spark',
  // The backend (docs/spark/BACKEND.md). Leave it empty for DEMO MODE: the whole flow works, but nothing is paid or stored.
  api: '',
  // How a customer pays (used when `api` is set).
  payments: {
    // 'upi'      pay our own UPI ID, the gift opens at once and the backend checks the bank email (docs/spark/UPI.md)
    // 'youpi'    a self-hosted YouPI-PG gateway (docs/spark/PAYMENTS.md)
    // 'razorpay' Razorpay Checkout
    provider: 'upi',
    // Your YouPI checkout portal: its address (https, no trailing slash) and the PUBLIC merchant key from its admin panel.
    // The webhook secret is a different thing: it lives only on the backend and must never appear in this repo or this site.
    youpi: { host: '', key: '' },
    // How long to wait for the backend to confirm after the customer has paid on screen, before saying "we are confirming".
    waitSeconds: 90,
  },
  // The WhatsApp number the gift link is sent from (digits with country code, shown on the thank-you screen). Optional.
  supportWhatsapp: '',
};
