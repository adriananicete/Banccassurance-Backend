import multer from "multer";

const fileMap = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const consentFileMap = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "avatar_uploads/");
  },

  filename: (req, file, cb) => {
    if (!fileMap[file.mimetype]) {
      const err = new Error("File type not allowed");
      err.statusCode = 400;
      cb(err);
      return;
    }
    const ext = fileMap[file.mimetype];
    const safeName = `${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

export const photoUpload = multer({
  storage: photoStorage,

  fileFilter: (req, file, cb) => {
    if (!fileMap[file.mimetype]) {
      const err = new Error("File type not allowed");
      err.statusCode = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },

  limits: {
    fileSize: 2 * 1024 * 1024, // ✅ 2MB
  },
});

const consentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    if (!consentFileMap[file.mimetype]) {
      const err = new Error("File type not allowed");
      err.statusCode = 400;
      cb(err);
      return;
    }
    const ext = consentFileMap[file.mimetype];
    const safeName = `${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

export const consentUpload = multer({
  storage: consentStorage,

  fileFilter: (req, file, cb) => {
    if (!consentFileMap[file.mimetype]) {
      const err = new Error("File type not allowed");
      err.statusCode = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
