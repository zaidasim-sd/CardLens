import express from "express";
import dotenv from "dotenv";
import { validateOcrConfig } from "./services/ocrService.js";
import { authHandler, usersHandler } from "./http/authHandlers.js";
import { cardsHandler, storageHealthHandler } from "./http/cardHandlers.js";
import supportHandler from "../api/support.js";
import { retentionSettingsHandler, sweepHandler } from "./http/retentionHandlers.js";
import ocrHandler from "./http/ocrHandler.js";
import exportHandler from "./http/exportHandler.js";

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
app.all("/api/export", exportHandler);

// Routes
app.all("/api/ocr", ocrHandler);

app.get("/api/config/exhibitions", (req, res) => {
  res.json({
    exhibitions: [
      { label: "Select exhibition", value: "" },
    ],
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Backend server running on http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  console.error("Backend server error:", error);
});
