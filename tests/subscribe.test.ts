import { test } from "node:test";
import assert from "node:assert/strict";

import { isValidEmail, normalizeEmail, makeConfirmToken } from "../src/lib/subscribe";

test("정상 주소를 통과시킨다", () => {
  for (const e of ["a@b.co", "name.surname@example.co.kr", "user+tag@sub.example.com"]) {
    assert.ok(isValidEmail(e), e);
  }
});

test("형식이 깨진 주소를 거른다", () => {
  for (const e of ["", "   ", "abc", "a@b", "a@@b.com", "a b@c.com", "@example.com", "a@.com", "a@b..com", ".a@b.com", "a.@b.com"]) {
    assert.equal(isValidEmail(e), false, e);
  }
});

test("길이 상한을 지킨다", () => {
  assert.equal(isValidEmail("a".repeat(65) + "@example.com"), false);
  assert.equal(isValidEmail("a".repeat(310) + "@example.com"), false);
  assert.ok(isValidEmail("a".repeat(64) + "@example.com"));
});

test("공백·대문자를 정규화한다", () => {
  assert.equal(normalizeEmail("  Name@Example.COM "), "name@example.com");
});

test("확인 토큰은 64자 hex", () => {
  const t = makeConfirmToken();
  assert.equal(t.length, 64);
  assert.match(t, /^[0-9a-f]{64}$/);
  assert.notEqual(t, makeConfirmToken());
});
