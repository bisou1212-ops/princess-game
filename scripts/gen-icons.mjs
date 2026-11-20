// 임시 앱 아이콘 생성기 (외부 의존성 없음). M7 아트 교체 때 실제 아이콘으로 바꾼다.
// 파스텔 하늘색 배경 + 분홍 왕관.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SKY = [0xbf, 0xe6, 0xff];
const PINK = [0xff, 0x8f, 0xc4];
const GOLD = [0xff, 0xe0, 0x8a];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
// 왕관: 정규화 좌표(0~1), scale로 크기 조절 (maskable은 안전영역 안으로 작게)
function crown(u, v, scale) {
  const x = (u - 0.5) / scale + 0.5, y = (v - 0.5) / scale + 0.5;
  const inBand = x > 0.22 && x < 0.78 && y > 0.58 && y < 0.72;
  let inPeaks = false;
  if (x > 0.22 && x < 0.78 && y > 0.32 && y <= 0.58) {
    // 세 꼭짓점(0.22, 0.5, 0.78) 사이를 톱니 모양으로
    const t = (x - 0.22) / 0.56; // 0..1
    const saw = Math.abs(((t * 2) % 1) - 0.5) * 2; // 꼭짓점에서 1
    const top = 0.58 - 0.26 * saw;
    inPeaks = y >= top;
  }
  const gems = [[0.22, 0.31], [0.5, 0.31], [0.78, 0.31]].some(
    ([gx, gy]) => (x - gx) ** 2 + (y - gy) ** 2 < 0.045 ** 2,
  );
  if (gems) return GOLD;
  if (inBand || inPeaks) return PINK;
  return null;
}
const icon = (scale) => (u, v) => crown(u, v, scale) ?? SKY;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, icon(1)));
writeFileSync('public/icons/icon-512.png', png(512, icon(1)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, icon(0.75)));
writeFileSync('public/icons/apple-touch-icon.png', png(180, icon(1)));
console.log('아이콘 생성 완료: public/icons/');
