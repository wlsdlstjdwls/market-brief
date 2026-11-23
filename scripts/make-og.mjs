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

/*
 * 2026-11-23 흑백 개편판. 검은 판 위에 파비콘과 같은 마크(흰 막대 둘, 머리줄만 파랑)와
 * 흰 워드마크. 카카오톡, 슬랙 미리보기에서 흰 바탕 카드들 사이에 묻히지 않게 판을 검게 깐다.
 * 마크 좌표는 make-icons.mjs의 64단위 마크를 4.5배로 키운 것이다.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>

  <g transform="translate(96 150) scale(4.5)">
    <rect x="0" y="0" width="40" height="8" fill="#2563eb"/>
    <rect x="0" y="16" width="40" height="8" fill="#ffffff"/>
    <rect x="0" y="32" width="24" height="8" fill="#ffffff"/>
  </g>

  <text x="340" y="262" font-family="${FONT}" font-size="118" font-weight="800" fill="#ffffff" letter-spacing="-4">더 브리핑</text>

  <text x="96" y="430" font-family="${FONT}" font-size="40" font-weight="600" fill="#ffffff">그날 시장을 움직인 뉴스와 테마</text>
  <text x="96" y="484" font-family="${FONT}" font-size="30" fill="#a3a3a3">평일 아침과 장 마감 뒤, 하루 두 번</text>

  <rect x="96" y="540" width="${W - 192}" height="1" fill="#3a3a3a"/>
  <text x="96" y="586" font-family="${FONT}" font-size="24" fill="#8a8a8a">개별 종목, 관련주, 목표주가는 싣지 않습니다</text>
  <text x="${W - 96}" y="586" font-family="${FONT}" font-size="24" font-weight="600" fill="#ffffff" text-anchor="end">thebriefing.kr</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync("src/app/opengraph-image.png", png);
console.log(`✓ src/app/opengraph-image.png (${W}x${H}, ${(png.length / 1024).toFixed(0)}KB)`);
