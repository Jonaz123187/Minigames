/* Size-bounded PNG fallback: 256-color RGB palette and stored DEFLATE blocks.
   No network decoder, metadata or third-party browser dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GiGBannerPNG = api;
})(globalThis, function () {
  "use strict";
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const u32 = (n) =>
    new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const join = (parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  function chunk(type, data) {
    const name = new Uint8Array([...type].map((c) => c.charCodeAt(0))),
      payload = join([name, data]);
    let crc = 0xffffffff;
    for (const b of payload) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
    return join([u32(data.length), payload, u32((crc ^ 0xffffffff) >>> 0)]);
  }
  function encode(rgba, width = 960, height = 480) {
    if (width !== 960 || height !== 480 || rgba.length !== width * height * 4)
      throw new Error("Ungültige Bannergröße.");
    const rows = new Uint8Array((width + 1) * height),
      palette = new Uint8Array(768);
    for (let i = 0; i < 256; i++) {
      palette[i * 3] = Math.round(((i >>> 5) * 255) / 7);
      palette[i * 3 + 1] = Math.round((((i >>> 2) & 7) * 255) / 7);
      palette[i * 3 + 2] = (i & 3) * 85;
    }
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4,
          alpha = rgba[p + 3] / 255;
        const r = Math.round(((rgba[p] * alpha + 21 * (1 - alpha)) * 7) / 255),
          g = Math.round(((rgba[p + 1] * alpha + 27 * (1 - alpha)) * 7) / 255),
          b = Math.round(((rgba[p + 2] * alpha + 38 * (1 - alpha)) * 3) / 255);
        rows[y * (width + 1) + 1 + x] = (r << 5) | (g << 2) | b;
      }
    const blocks = [new Uint8Array([0x78, 0x01])];
    let a = 1,
      b = 0;
    for (const n of rows) {
      a = (a + n) % 65521;
      b = (b + a) % 65521;
    }
    for (let i = 0; i < rows.length; i += 65535) {
      const part = rows.subarray(i, Math.min(i + 65535, rows.length)),
        n = part.length;
      blocks.push(
        new Uint8Array([
          i + n === rows.length ? 1 : 0,
          n & 255,
          n >>> 8,
          ~n & 255,
          (~n >>> 8) & 255,
        ]),
        part,
      );
    }
    blocks.push(u32(((b << 16) | a) >>> 0));
    return join([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk(
        "IHDR",
        join([u32(width), u32(height), new Uint8Array([8, 3, 0, 0, 0])]),
      ),
      chunk("PLTE", palette),
      chunk("IDAT", join(blocks)),
      chunk("IEND", new Uint8Array()),
    ]);
  }
  return { encode };
});
