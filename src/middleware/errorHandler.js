import multer from "multer";

export const errorHandler = (err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError)
    return res.status(400).json({
      success: false,
      message: "File too large",
    });

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
