import fs from "fs/promises";
import { signatureOf, SIGNATURE_BYTES } from "../utils/fileSignature.js";

export const verifyFileSignature = (allowedKinds) => async (req, res, next) => {
  if (!req.file) return next();

  let handle;
  try {
    handle = await fs.open(req.file.path, "r");
    const buffer = Buffer.alloc(SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SIGNATURE_BYTES, 0);
    await handle.close();
    handle = null;

    const kind = signatureOf(buffer.subarray(0, bytesRead));

    if (!kind || !allowedKinds.includes(kind)) {
      await fs.unlink(req.file.path).catch(() => {});

      const error = new Error(
        `This file is not a valid ${allowedKinds.join(", ")}. Its contents do not match any accepted format, whatever the file is named.`,
      );
      error.statusCode = 400;
      return next(error);
    }

    req.file.detectedKind = kind;
    return next();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    return next(error);
  }
};
