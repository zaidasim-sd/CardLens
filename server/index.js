import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/ocr", (_req, res) => res.status(403).json({error:'PUBLIC_PROTOTYPE_FICTIONAL_DEMO_ONLY'}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

