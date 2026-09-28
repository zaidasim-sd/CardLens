import { hasReadableContact, NO_CONTACT_MESSAGE } from "../../shared/contactValidation.mjs";
import express from "express";
import multer from "multer";
import { performOCR } from "../services/ocrService.js";
import { parseOCRText } from "../services/cardParser.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1.5 * 1024 * 1024 }, // 1.5 MB — OCR.space free plan limit
});

router.post(
  "/",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "imageBack", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files || {};
      const frontFile = files.image?.[0] || null;
      const backFile = files.imageBack?.[0] || null;

      if (!frontFile && !backFile) {
        return res.status(400).json({ error: "No image file provided." });
      }

      // MIME type validation
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
      if (frontFile && !allowedMimeTypes.includes(frontFile.mimetype)) {
        return res.status(400).json({ error: "Invalid front image format. Supported: JPG, PNG, WEBP." });
      }
      if (backFile && !allowedMimeTypes.includes(backFile.mimetype)) {
        return res.status(400).json({ error: "Invalid back image format. Supported: JPG, PNG, WEBP." });
      }

      let frontText = "";
      let backText = "";
      let frontResult = null;
      let backResult = null;

      if (frontFile) {
        try {
          frontResult = await performOCR(frontFile.buffer);
          frontText = frontResult.rawText || "";
        } catch (err) {
          console.error("Front card OCR error:", err.message);
          if (!backFile) {
            throw err;
          }
        }
      }

      if (backFile) {
        try {
          // If frontFile was also processed, wait 600ms to avoid API rate limiting
          if (frontFile) {
            await new Promise((res) => setTimeout(res, 600));
          }
          backResult = await performOCR(backFile.buffer);
          backText = backResult.rawText || "";
        } catch (err) {
          console.warn("Back card OCR warning (falling back to front only):", err.message);
          if (!frontText) {
            throw err;
          }
        }
      }

      if (!frontResult && !backResult) {
        throw new Error("Unable to scan this business card. Please try again.");
      }

      const combinedRawText = backText
        ? `${frontText}\n\n--- BACK SIDE ---\n\n${backText}`
        : frontText;

      const parsed = parseOCRText(combinedRawText);
      if (!hasReadableContact(combinedRawText, parsed)) {
        return res.status(422).json({ code: "NO_CONTACT_DETECTED", error: NO_CONTACT_MESSAGE });
      }

      res.json({
        rawText: combinedRawText,
        parsed: parsed,
        provider: frontResult?.provider || backResult?.provider || "google",
        success: true,
      });
    } catch (error) {
      console.error("OCR Route Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to process image." });
    }
  }
);

export default router;

