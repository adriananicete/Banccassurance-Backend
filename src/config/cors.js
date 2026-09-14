// Temporary: allow a second local dev port (3001) alongside the default 3000
// until the frontend settles on one. Remove 3001 once that's no longer needed.
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000", "http://localhost:3001"];

export const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ["Content-Disposition"],
};
