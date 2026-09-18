/**
 * 공유 카드(og:image)를 만든다. 1회성이지만 문구나 색을 바꾸면 다시 돌린다.
 *
 *   node scripts/make-og.mjs
 *
 * 왜 `next/og`의 ImageResponse를 쓰지 않았나 — satori가 woff2를 못 읽어서 한글 글꼴을
 * TTF로 따로 실어야 하는데, Noto Sans KR 원본이 수 MB다. 서버리스 함수에 넣기엔 무겁고
 * 서브셋을 뜰 도구도 없다. 글자가 고정된 카드라 미리 구워 두면 그만이다.
 *
 * 렌더는 sharp(librsvg)가 하고 한글은 윈도우의 Malgun Gothic으로 그린다.
 * 결과물이 PNG라 Vercel에는 글꼴이 필요 없다.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const W = 1200;
const H = 630;
const FONT = "Malgun Gothic, Noto Sans KR, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#fbfaf7"/>
  <rect x="0" y="0" width="${W}" height="10" fill="#2563eb"/>

  <text x="90" y="200" font-family="${FONT}" font-size="34" font-weight="600" fill="#2563eb" letter-spacing="6">DAILY</text>

  <text x="90" y="330" font-family="${FONT}" font-size="104" font-weight="700" fill="#14161a">더 브리핑</text>

  <rect x="90" y="382" width="120" height="3" fill="#14161a"/>

  <text x="90" y="452" font-family="${FONT}" font-size="36" fill="#4a4e52">그날 시장을 움직인 뉴스와 테마</text>

  <text x="90" y="548" font-family="${FONT}" font-size="26" fill="#6e7276">개별 종목, 관련주, 목표주가는 싣지 않습니다</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync("src/app/opengraph-image.png", png);
console.log(`✓ src/app/opengraph-image.png (${W}x${H}, ${(png.length / 1024).toFixed(0)}KB)`);
