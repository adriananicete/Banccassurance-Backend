import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import referralRoutes from "./routes/referralRoutes.js";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import { globalLimiter } from "./middleware/rateLimiter.js";
import underwritingRoutes from "./routes/underwritingRoutes.js"
import userRoutes from "./routes/userRoutes.js";
import lookupRoutes from "./routes/lookupRoutes.js";
import consentRoutes from "./routes/consentRoutes.js";
import { API_VERSION_PREFIX } from "./utils/constant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000", 
    credentials: true,
  }),
);

app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(globalLimiter);

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use(`${API_VERSION_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_VERSION_PREFIX}/referrals`, referralRoutes);
app.use(`${API_VERSION_PREFIX}/auth`, authRoutes);
app.use(`${API_VERSION_PREFIX}/users`, userRoutes);
app.use(`${API_VERSION_PREFIX}/lookups`, lookupRoutes);
app.use(`${API_VERSION_PREFIX}/consent`, consentRoutes);
app.use(`${API_VERSION_PREFIX}/underwriting/referrals`, underwritingRoutes);

app.use("/uploads", express.static(path.join(__dirname, "../avatar_uploads")));

app.use(errorHandler);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
})
