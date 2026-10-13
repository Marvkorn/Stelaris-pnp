import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fail = () => { const e = new Error('Ungültiges Bild. Erlaubt sind PNG, JPEG und WebP bis 5 MB und 24 Megapixel.'); e.status = 400; throw e; };
const dimensions = (w, h) => { if (!w || !h || w * h > 24000000 || w > 16000 || h > 16000) fail(); };
export function validateImage(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail();
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 24 || bytes.length > 5 * 1024 * 1024) fail();
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    let offset = 8, header = false, data = false, end = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (offset + 12 + size > bytes.length || (!header && type !== 'IHDR')) fail();
      if (type === 'IHDR') { if (header || size !== 13) fail(); dimensions(bytes.readUInt32BE(offset+8),bytes.readUInt32BE(offset+12)); header = true; }
      if (type === 'IDAT') data = true;
      offset += size + 12;
      if (type === 'IEND') { if (size || offset !== bytes.length) fail(); end = true; break; }
    }
    if (!header || !data || !end) fail();
    return { bytes, ext: 'png' };
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    let offset = 2, found = false, scan = false;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) fail();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda) { scan = true; break; }
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) fail();
      if ([0xc0,0xc1,0xc2].includes(marker)) { if (size < 8) fail(); dimensions(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)); found = true; }
      offset += size;
    }
    if (!found || !scan) fail();
    return { bytes, ext: 'jpg' };
  }
  if (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' && bytes.readUInt32LE(4)+8===bytes.length) {
    let offset=12, found=false;
    while(offset+8<=bytes.length) {
      const type=bytes.toString('ascii',offset,offset+4), size=bytes.readUInt32LE(offset+4), p=offset+8;
      if(p+size>bytes.length) fail();
      if(type==='VP8 ' && size>=10 && bytes.subarray(p+3,p+6).equals(Buffer.from([0x9d,0x01,0x2a]))) { dimensions(bytes.readUInt16LE(p+6)&0x3fff,bytes.readUInt16LE(p+8)&0x3fff); found=true; }
      if(type==='VP8L' && size>=5 && bytes[p]===0x2f) { const bits=bytes.readUInt32LE(p+1); dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1); found=true; }
      if(type==='VP8X' && size>=10) dimensions(bytes.readUIntLE(p+4,3)+1,bytes.readUIntLE(p+7,3)+1);
      offset=p+size+(size%2);
    }
    if (!found || offset!==bytes.length) fail();
    return { bytes, ext:'webp' };
  }
  fail();
}
export function storeImage(directory, validated) {
  const filename = `${randomUUID()}.${validated.ext}`;
  writeFileSync(resolve(directory, 'images', filename), validated.bytes, { flag:'wx' });
  return filename;
}
