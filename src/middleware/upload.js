import multer from "multer";
import path from "path";

const photoExtensions = {
  ".jpg": ".jpg",
  ".jpeg": ".jpg",
  ".png": ".png",
  ".gif": ".gif",
  ".webp": ".webp",
};

const consentExtensions = { ...photoExtensions, ".pdf": ".pdf" };

const rejectExtension = (extensions, received) => {
  const allowed = [...new Set(Object.keys(extensions))].join(", ");
  const error = new Error(
    received
      ? `File type ${received} is not allowed. Accepted types: ${allowed}`
      : `The file has no extension. Accepted types: ${allowed}`,
  );
  error.statusCode = 400;
  return error;
};

const storageFor = (destination, extensions) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),

    filename: (req, file, cb) => {
      const received = path.extname(file.originalname || "").toLowerCase();
      const ext = extensions[received];

      if (!ext) return cb(rejectExtension(extensions, received));

      cb(null, `${Date.now()}${ext}`);
    },
  });

const filterFor = (extensions) => (req, file, cb) => {
  const received = path.extname(file.originalname || "").toLowerCase();

  if (!extensions[received]) return cb(rejectExtension(extensions, received));

  cb(null, true);
};

export const photoUpload = multer({
  storage: storageFor("avatar_uploads/", photoExtensions),
  fileFilter: filterFor(photoExtensions),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

export const consentUpload = multer({
  storage: storageFor("uploads/", consentExtensions),
  fileFilter: filterFor(consentExtensions),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});
