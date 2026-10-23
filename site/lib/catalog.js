// Loads every product's manifest and sample, in the order products/index.json lists them.
const PRODUCTS = new URL('../../products/', import.meta.url);

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

export async function loadCatalog() {
  const ids = await json(new URL('index.json', PRODUCTS));
  return Promise.all(ids.map(async (id) => {
    const [manifest, sample] = await Promise.all([json(new URL(`${id}/product.json`, PRODUCTS)), json(new URL(`${id}/sample.json`, PRODUCTS))]);
    return { ...manifest, sample: sample.options };
  }));
}

/** A price for the shop: whole rupees with Indian digit grouping. */
export const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
