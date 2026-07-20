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

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/referrals/notifications", notificationRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/auth", authRoutes);

app.use("/uploads", express.static(path.join(__dirname, "../avatar_uploads")));

app.use(errorHandler);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
