import test from "node:test";
import assert from "node:assert/strict";
import {
  signatureOf,
  imageKinds,
  documentKinds,
  SIGNATURE_BYTES,
} from "../src/utils/fileSignature.js";

const bytes = (...values) => Buffer.from(values);

const headers = {
  png: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13),
  jpg: bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1),
  gif: bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0),
  webp: bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50),
  pdf: bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0),
};

test("identifies each accepted format from its leading bytes", () => {
  for (const [kind, header] of Object.entries(headers)) {
    assert.equal(signatureOf(header), kind);
  }
});

test("an AVI is refused even though RIFF matches, because WEBP at offset 8 does not", () => {
  const avi = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x41, 0x56, 0x49, 0x20);
  assert.equal(signatureOf(avi), null);
});

test("returns null for anything unrecognised", () => {
  assert.equal(signatureOf(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)), null);
  assert.equal(signatureOf(Buffer.from("hello world!")), null);
});

test("returns null rather than throwing on absent or unusable input", () => {
  assert.equal(signatureOf(null), null);
  assert.equal(signatureOf(undefined), null);
  assert.equal(signatureOf(Buffer.alloc(0)), null);
  assert.equal(signatureOf(bytes(0x89, 0x50)), null);
});

test("a truncated WebP header does not match on RIFF alone", () => {
  assert.equal(signatureOf(bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0)), null);
});

test("a PNG renamed .jpg is still identified as a PNG", () => {
  assert.equal(signatureOf(headers.png), "png");
  assert.ok(imageKinds.includes(signatureOf(headers.png)));
});

test("PDF is refused for avatars and accepted for consent documents", () => {
  assert.equal(imageKinds.includes(signatureOf(headers.pdf)), false);
  assert.equal(documentKinds.includes(signatureOf(headers.pdf)), true);
});

test("SIGNATURE_BYTES covers the furthest marker any signature needs", () => {
  assert.ok(SIGNATURE_BYTES >= 12);
  const exactlyEnough = headers.webp.subarray(0, SIGNATURE_BYTES);
  assert.equal(signatureOf(exactlyEnough), "webp");
});
