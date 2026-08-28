const signatures = [
  { kind: "png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: "jpg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { kind: "gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { kind: "pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  {
    kind: "webp",
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46],
    also: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  },
];

export const SIGNATURE_BYTES = 12;

const matches = (buffer, offset, bytes) =>
  bytes.every((byte, i) => buffer[offset + i] === byte);

export const signatureOf = (buffer) => {
  if (!buffer || buffer.length < 3) return null;

  for (const signature of signatures) {
    if (buffer.length < signature.offset + signature.bytes.length) continue;
    if (!matches(buffer, signature.offset, signature.bytes)) continue;

    if (signature.also) {
      if (buffer.length < signature.also.offset + signature.also.bytes.length) continue;
      if (!matches(buffer, signature.also.offset, signature.also.bytes)) continue;
    }

    return signature.kind;
  }

  return null;
};

export const imageKinds = ["png", "jpg", "gif", "webp"];
export const documentKinds = [...imageKinds, "pdf"];
