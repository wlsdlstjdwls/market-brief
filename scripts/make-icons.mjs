/**
 * 파비콘과 앱 아이콘을 굽는다. 1회성이지만 마크나 색을 바꾸면 다시 돌린다.
 *
 *   node scripts/make-icons.mjs
 *
 * 만드는 것
 *   src/app/favicon.ico        16 + 32 + 48. SVG 파비콘을 못 읽는 브라우저의 폴백
 *   src/app/apple-icon.png     180x180. iOS "홈 화면에 추가"
 *   public/icon-192.png        manifest 표준 크기
 *   public/icon-512.png        manifest 표준 크기
 *   public/icon-maskable.png   512x512, 안드로이드 적응형 아이콘
 *
 * `make-og.mjs`와 같은 방식이다 — SVG를 sharp(librsvg)로 래스터화한다.
 * 글자가 없는 도형이라 글꼴이 필요 없고, 결과가 PNG라 서버에도 필요 없다.
 *
 * **ICO는 sharp가 못 쓴다.** 컨테이너를 손으로 짠다. 의존성을 하나 더 들이는 것보다
 * 싸다 — 포맷이 헤더 6바이트 + 항목당 16바이트 + PNG 본문이 전부다.
 * 본문을 BMP가 아니라 PNG로 넣는 형식은 Vista 이후 전 브라우저가 읽는다.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

/** 브랜드 값. `globals.css`의 토큰과 같아야 한다. */
const BG = "#fbfaf7";
const ACCENT = "#2563eb";
const INK = "#14161a";

/**
 * 마크 세 줄. 브리핑 한 편을 줄로 줄인 모양이고, 머리줄만 브랜드 블루다.
 *
 * 64단위에서 두께가 8이다. 16px로 줄면 2px가 되는데, 3줄 마크를 알아볼 수 있는
 * 사실상의 하한이다. 예전 값(두께 3, 4줄)은 16px에서 0.75px이라 회색 얼룩이 됐다.
 *
 * **좌표를 전부 4의 배수로 둔다.** 16px 파비콘의 1픽셀이 64단위의 4에 해당하므로,
 * 4로 안 떨어지면 막대가 반 픽셀에 걸려 흐려진다. 아래 막대만 회색으로 뭉갰던 게
 * 이 때문이다 (y=41 → 10.25px).
 */
const bars = () => `
  <rect x="12" y="12" width="40" height="8" fill="${ACCENT}"/>
  <rect x="12" y="28" width="40" height="8" fill="${INK}"/>
  <rect x="12" y="44" width="24" height="8" fill="${INK}"/>`;

/**
 * 판 위의 마크. 탭과 홈 화면에 그대로 놓이는 모양이다.
 *
 * **모서리를 굴리지 않는다.** `design/design-spec.md`가 "카드, 박스, 둥근 모서리,
 * 배경 채움 없음"이다. iOS와 안드로이드 런처는 어차피 제 모양대로 깎아 내므로
 * 각진 판을 넣어도 손해가 없고, 탭의 16px에서는 반경이 보이지도 않는다.
 */
const plate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>${bars()}
</svg>`;

/**
 * 안드로이드 적응형 아이콘용. 바탕을 모서리까지 채우고 마크를 68%로 줄인다.
 *
 * 런처가 제조사마다 다른 모양으로 잘라 내므로 가장자리는 잘린다고 봐야 한다.
 * 안전 영역이 가운데 80%라 마크를 68%로 줄여 그 안에 넣는다.
 */
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}"/>
  <g transform="translate(32 32) scale(0.68) translate(-32 -32)">${bars()}</g>
</svg>`;

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/**
 * PNG 몇 장을 ICO 한 장으로 묶는다.
 *
 * ICONDIR 6바이트 + ICONDIRENTRY 16바이트씩 + 본문. 너비/높이 바이트는 256을 0으로
 * 적는 규칙인데 여기서 쓰는 크기는 48 이하라 해당되지 않는다.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = 아이콘
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width
    e.writeUInt8(size, 1); // height
    e.writeUInt8(0, 2); // 팔레트 없음
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync("public", { recursive: true });

const sizes = [16, 32, 48];
const favicon = ico(
  await Promise.all(sizes.map(async (size) => ({ size, data: await png(plate, size) }))),
);
writeFileSync("src/app/favicon.ico", favicon);
console.log(`✓ src/app/favicon.ico (${sizes.join("+")}, ${(favicon.length / 1024).toFixed(1)}KB)`);

for (const [path, svg, size] of [
  ["src/app/apple-icon.png", plate, 180],
  ["public/icon-192.png", plate, 192],
  ["public/icon-512.png", plate, 512],
  ["public/icon-maskable.png", maskable, 512],
]) {
  const buf = await png(svg, size);
  writeFileSync(path, buf);
  console.log(`✓ ${path} (${size}x${size}, ${(buf.length / 1024).toFixed(1)}KB)`);
}
