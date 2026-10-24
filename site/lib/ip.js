// The browser's own internet (IP) address, from ipify. Used for one thing only: telling whether a gift was opened from somewhere other than
// where it was ordered (the "tell me when it is opened" option). It is the browser's own report, so it is never used for anything about money.
// A failed or slow lookup returns '' and the feature simply does not fire (the privacy policy names ipify).
export async function getIp(timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    const { ip } = await res.json();
    return typeof ip === 'string' ? ip : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}
