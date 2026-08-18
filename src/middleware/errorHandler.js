import multer from "multer";

const multerMessages = {
  LIMIT_FILE_SIZE: "File too large",
  LIMIT_UNEXPECTED_FILE: (err) =>
    `Unexpected file field "${err.field}". Check the form-data key name.`,
  LIMIT_FILE_COUNT: "Too many files",
  LIMIT_PART_COUNT: "Too many parts in the form data",
  LIMIT_FIELD_KEY: "A field name is too long",
  LIMIT_FIELD_VALUE: "A field value is too long",
  LIMIT_FIELD_COUNT: "Too many fields in the form data",
};

export const errorHandler = (err, req, res, next) => {
  console.error(err);

  if (err instanceof multer.MulterError) {
    const entry = multerMessages[err.code];
    const message =
      typeof entry === "function"
        ? entry(err)
        : entry || `Upload failed (${err.code})`;

    return res.status(400).json({
      success: false,
      message,
    });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Server Error",
  });
};
