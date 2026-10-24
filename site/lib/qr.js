// A QR code for any text, drawn as one SVG path (sharp at any size, no image file, nothing sent anywhere).
// The encoding is the vendored qrcode-generator (site/lib/vendor); this file only turns its grid into something to draw.
import qrcode from './vendor/qrcode.mjs';

/** The QR grid for `text`: an array of rows, each an array of booleans (true = dark module). */
export function qrMatrix(text, level = 'M') {
  const qr = qrcode(0, level); // 0 = pick the smallest size that fits
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** An <svg> of the QR code with the quiet border a scanner needs. Dark modules use currentColor. */
export function qrSvg(text, { border = 3 } = {}) {
  const grid = qrMatrix(text);
  const size = grid.length + border * 2;
  let d = '';
  grid.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c + border} ${r + border}h1v1h-1z`; }));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code to pay with any UPI app');
  const back = document.createElementNS(ns, 'rect');
  back.setAttribute('width', size);
  back.setAttribute('height', size);
  back.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(back, path);
  return svg;
}
