/* Pure JS STORE ZIP Builder (no external dependencies, UTF-8 filenames supported) */
(function (global) {
  'use strict';
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c >>> 0;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosTimeDate(d) {
    const dt = d || new Date();
    const time = ((dt.getHours() & 0x1f) << 11) | ((dt.getMinutes() & 0x3f) << 5) | ((dt.getSeconds() >> 1) & 0x1f);
    const date = (((Math.max(1980, dt.getFullYear()) - 1980) & 0x7f) << 9) | (((dt.getMonth() + 1) & 0xf) << 5) | (dt.getDate() & 0x1f);
    return { time, date };
  }

  /**
   * files: Array<{ path: string, data: Uint8Array }>
   * Returns Blob (application/zip)
   */
  function buildZip(files) {
    const enc = new TextEncoder();
    const { time, date } = dosTimeDate(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = enc.encode(file.path.replace(/^\/+/, ''));
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = crc32(data);
      const size = data.length;

      // Local file header (30 bytes + name)
      const lh = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(lh);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);         // version needed
      lv.setUint16(6, 0x0800, true);     // UTF-8 flag
      lv.setUint16(8, 0, true);          // compression: STORE (0)
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      new Uint8Array(lh, 30).set(nameBytes);

      localParts.push(new Uint8Array(lh), data);

      // Central directory header (46 bytes + name)
      const ch = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(ch);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);     // UTF-8 flag
      cv.setUint16(10, 0, true);         // STORE
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      new Uint8Array(ch, 46).set(nameBytes);

      centralParts.push(new Uint8Array(ch));
      offset += 30 + nameBytes.length + size;
    }

    let centralSize = 0;
    for (const part of centralParts) centralSize += part.length;

    // End of central directory (22 bytes)
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], { type: 'application/zip' });
  }

  global.SimpleZip = { buildZip };
})(window);
