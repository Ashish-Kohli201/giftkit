// A small ZIP writer (zero dependencies) so a built gift can be dragged onto any static host as one file.
// Text files are deflated in memory; media (already compressed) is stored as-is and streamed in two passes
// (first for its CRC, then for the bytes), so a 300 MB video never sits in memory.
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { once } from 'node:events';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(buf, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

async function crcOfFile(path) {
  let crc = 0;
  for await (const chunk of createReadStream(path)) crc = crc32(chunk, crc);
  return crc;
}

const dosDateTime = (d) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

function localHeader(name, { crc, size, csize, method, time, date }) {
  const n = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
  h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(csize, 18); h.writeUInt32LE(size, 22);
  h.writeUInt16LE(n.length, 26);
  return Buffer.concat([h, n]);
}

function centralEntry(name, e, offset) {
  const n = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(e.method, 10);
  h.writeUInt16LE(e.time, 12); h.writeUInt16LE(e.date, 14); h.writeUInt32LE(e.crc, 16); h.writeUInt32LE(e.csize, 20); h.writeUInt32LE(e.size, 24);
  h.writeUInt16LE(n.length, 28); h.writeUInt32LE(offset, 42);
  return Buffer.concat([h, n]);
}

/**
 * @param outPath  where to write the .zip
 * @param entries  [{ name: 'folder/file.ext', data?: Buffer, path?: string }]  (use `path` for big media files)
 */
export async function writeZip(outPath, entries) {
  const out = createWriteStream(outPath);
  const write = async (buf) => { if (!out.write(buf)) await once(out, 'drain'); };
  const central = [];
  const { time, date } = dosDateTime(new Date());
  let offset = 0;
  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, '/');
    let info;
    if (entry.data) {
      const deflated = deflateRawSync(entry.data);
      const useDeflate = deflated.length < entry.data.length;
      info = { crc: crc32(entry.data), size: entry.data.length, csize: useDeflate ? deflated.length : entry.data.length, method: useDeflate ? 8 : 0, time, date };
      const head = localHeader(name, info);
      await write(head); await write(useDeflate ? deflated : entry.data);
      offset += head.length + info.csize;
    } else {
      const size = (await stat(entry.path)).size;
      info = { crc: await crcOfFile(entry.path), size, csize: size, method: 0, time, date };
      const head = localHeader(name, info);
      await write(head);
      for await (const chunk of createReadStream(entry.path)) await write(chunk);
      offset += head.length + size;
    }
    central.push(centralEntry(name, info, offset - info.csize - localHeader(name, info).length));
  }
  const dirStart = offset;
  let dirSize = 0;
  for (const c of central) { await write(c); dirSize += c.length; }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dirSize, 12); end.writeUInt32LE(dirStart, 16);
  await write(end);
  out.end();
  await once(out, 'finish');
}
