/**
 * 종목 브리핑 금액 표기. 칸마다 단위가 붙어야 한다(2026-11-23 사용자 지적, "금액 단위가 안 나와 보기 힘들다").
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fmtAmt, fmtPrice } from "../src/lib/stock-format";

test("금액은 크기에 맞는 단위를 붙인다", () => {
  assert.equal(fmtAmt(1_176_409_636_239, "KRW"), "1.18조");
  assert.equal(fmtAmt(30_872_413_099, "KRW"), "309억");
  assert.equal(fmtAmt(-88_179_245_071, "KRW"), "-882억");
  assert.equal(fmtAmt(12_345_678_901_234, "KRW"), "12.3조");
  assert.equal(fmtAmt(52_000_000, "KRW"), "5,200만");
  assert.equal(fmtAmt(null, "KRW"), "-");
  assert.equal(fmtAmt(0, "KRW"), "0");
});

test("해외는 달러를 붙이고, 통화가 없는 옛 줄은 원으로 본다", () => {
  assert.equal(fmtAmt(96_200_000_000, "USD"), "962억달러");
  assert.equal(fmtAmt(3_025_300_000_000, "USD"), "3.03조달러");
  assert.equal(fmtAmt(30_000_000_000, undefined), "300억");
  assert.equal(fmtPrice(125.5, "USD"), "$125.50");
  assert.equal(fmtPrice(16730, undefined), "16,730원");
});
