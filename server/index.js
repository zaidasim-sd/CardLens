import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ocrRoutes from "./routes/ocr.js";
import { validateOcrConfig } from "./services/ocrService.js";
import { authHandler, usersHandler } from "./http/authHandlers.js";
import { cardsHandler, storageHealthHandler } from "./http/cardHandlers.js";
import supportHandler from "../api/support.js";

// Load environment variables
dotenv.config();

// Validate OCR configuration
validateOcrConfig();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.all("/api/auth", authHandler);
app.all("/api/users", usersHandler);
app.all("/api/cards", cardsHandler);
app.all("/api/storage-health", storageHealthHandler);
app.all("/api/support", supportHandler);

// Routes
app.use("/api/ocr", ocrRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

