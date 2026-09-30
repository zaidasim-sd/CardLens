import express from "express";
import dotenv from "dotenv";
import { validateOcrConfig } from "./services/ocrService.js";
import { authHandler, usersHandler } from "./http/authHandlers.js";
import { cardsHandler, storageHealthHandler } from "./http/cardHandlers.js";
import supportHandler from "../api/support.js";
import { retentionSettingsHandler, sweepHandler } from "./http/retentionHandlers.js";
import ocrHandler from "./http/ocrHandler.js";
import constantContactHandler from "./http/constantContactHandler.js";

// Load environment variables
dotenv.config();

// Validate OCR configuration
validateOcrConfig();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "1mb" }));

app.all("/api/auth", authHandler);
app.all("/api/users", usersHandler);
app.all("/api/cards", cardsHandler);
app.all("/api/storage-health", storageHealthHandler);
app.all("/api/support", supportHandler);
app.all("/api/retention", retentionSettingsHandler);
app.all("/api/cron/sweep", sweepHandler);
app.all("/api/constant-contact", constantContactHandler);

// Routes
app.all("/api/ocr", ocrHandler);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

