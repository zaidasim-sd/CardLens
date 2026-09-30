# CardSnap by Vision71 — Frontend/Backend API Contract

> **Target Audience:** Haroon, Hassan, Backend Team, Vision71  
> **Frontend Integration Status:** Active & Aligned with Version 1 Workflow  
> **Security Requirement:** No credentials or secrets must ever be placed in frontend code.

---

## 1. Overview & Architecture

The CardSnap frontend communicates with the backend via centralized services located in `src/lib/api/`.

```
Frontend React UI
   ↓
src/lib/api/ (client.ts, ocr.ts, contacts.ts, export.ts, exhibitions.ts)
   ↓
Vite Proxy / Configurable Base URL (VITE_API_BASE_URL)
   ↓
Backend API (/api/*) → MongoDB Atlas (Encrypted) + Google Sheet Review Workflow
```

---

## 2. Base URL & Environment Configuration

| Variable | Description | Default (Local) | Staging / Prod Example |
|---|---|---|---|
| `VITE_API_BASE_URL` | Base URL for backend API calls. Leave empty for relative calls (same-origin / Vite proxy). | `""` (proxied to `http://localhost:3000`) | `https://cardsnap-staging.vision71tech.com` |

---

## 3. Authentication & Security Contract

### Session & Cookies
- **Cookie Name:** `cardsnap_session`
- **Cookie Attributes:** `HttpOnly`, `SameSite=Strict`, `Secure` (in HTTPS), path `/`.
- **Session Duration:** 8 hours max, 30 minutes idle timeout.

### CSRF Protection
- **Header:** `X-CSRF-Token`
- Mutating HTTP requests (`POST`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header.
- The token is retrieved via `GET /api/auth?action=csrf` or on sign-in session response.

### Roles
- `exhibition_assistant` (Capturer): Captures cards, reviews own draft/submission, submits for review.
- `aventure_reviewer` (Reviewer): Review takes place primarily in the Aventure-owned Google Sheet.
- `vision71_administrator` (Administrator): Manages named accounts (`/api/users`), data retention, and export.
- `vision71_support` (Support): Diagnostic access, aggregate numbers only; expires after 24 hours.

---

## 4. Endpoints Specification

### 4.1 Authentication Endpoints

#### `GET /api/auth?action=session`
- **Description:** Verifies current session from cookie.
- **Request:** Cookie `cardsnap_session`.
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "string",
      "tenantId": "string",
      "name": "Muhammad Ali Zakaria",
      "email": "user@vision71tech.com",
      "role": "exhibition_assistant",
      "expiresAt": "2026-09-30T23:59:59.000Z"
    },
    "csrfToken": "string"
  }
  ```
- **Response (401 Unauthorized):**
  ```json
  { "error": "Authentication required." }
  ```

#### `GET /api/auth?action=csrf`
- **Description:** Obtains pre-auth CSRF token for sign-in.
- **Response (200 OK):**
  ```json
  { "csrfToken": "string" }
  ```

#### `POST /api/auth?action=sign_in`
- **Headers:** `Content-Type: application/json`, `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "tenantId": "default",
    "email": "user@vision71tech.com",
    "password": "password"
  }
  ```
- **Response (200 OK):** Returns user object, csrfToken, sets `cardsnap_session` cookie.

#### `POST /api/auth?action=sign_out`
- **Description:** Revokes session on server and clears cookie.

---

### 4.2 OCR Endpoint

#### `POST /api/ocr`
- **Description:** Accepts card photo and processes it with Google Cloud Vision API only.
- **Headers:** `Content-Type: multipart/form-data`, `X-CSRF-Token: <token>`
- **Request Body (FormData):**
  - `image`: File (JPEG, PNG, WEBP, max 2 MB)
- **Response (200 OK):**
  ```json
  {
    "rawText": "John Doe\nVP Sales\nAeroCorp\njohn@example.com\n+1 555-0199",
    "parsed": {
      "fullName": "John Doe",
      "companyName": "AeroCorp",
      "jobTitle": "VP Sales",
      "email": "john@example.com",
      "phone": "+1 555-0199",
      "notes": ""
    },
    "provider": "google",
    "success": true
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `{ "code": "IMAGE_REQUIRED", "error": "No image file provided." }`
  - `413 Payload Too Large`: `{ "code": "IMAGE_TOO_LARGE", "error": "Image file too large." }`
  - `422 Unprocessable Entity`: `{ "code": "NO_CONTACT_DETECTED", "error": "We couldn't read enough information from this card..." }`
  - `429 Too Many Requests`: `{ "code": "OCR_RATE_LIMITED" }` or `{ "code": "OCR_MONTHLY_CAP_REACHED" }`
  - `500 Server Error`: `{ "code": "OCR_FAILED", "error": "Google Vision processing failed." }`
- **Frontend Behavior on Error:** Prompt user to **Retake card** or **Enter details manually**. No automatic fallback to OCR.space for Aventure cards.

---

### 4.3 Contacts & Review Queue Endpoints

#### `POST /api/cards` (Submit Contact for Review)
- **Headers:** `Content-Type: application/json`, `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "rawOCRText": "string",
    "ocrData": { ... },
    "verifiedData": {
      "fullName": "John Doe",
      "companyName": "AeroCorp",
      "jobTitle": "VP Sales",
      "email": "john@example.com",
      "phone": "+1 555-0199",
      "notes": "Met at booth",
      "meetingContext": {
        "metAtLocation": "Exhibition Name",
        "notes": "Met at booth"
      }
    },
    "originalFileName": "card.jpg",
    "isDemo": false,
    "source": "ocr",
    "status": "submitted",
    "allowDuplicate": false,
    "imageBase64": "base64...",
    "imageMimeType": "image/jpeg"
  }
  ```
- **Backend Responsibilities:**
  - Automatic `createdAt` / `capturedAt`
  - Automatic `capturedBy` (from authenticated session user)
  - AES-256-GCM encryption of contact fields and images
  - Appends pending row to Aventure Google Sheet with `status: "Pending Review"`
- **Response (200 OK):**
  ```json
  {
    "record": {
      "id": "67...",
      "tenantId": "...",
      "capturedBy": "user_id",
      "status": "submitted",
      "createdAt": "2026-09-30T10:00:00.000Z",
      "verifiedData": { ... }
    }
  }
  ```
- **Duplicate Conflict (409 Conflict):**
  ```json
  {
    "code": "DUPLICATE_CONTACT",
    "error": "A matching contact already exists.",
    "duplicate": { "id": "...", "createdAt": "...", "verifiedData": { ... } }
  }
  ```

#### `GET /api/cards` (List Submissions / Review Queue)
- **Description:** Returns contacts list. Capturer sees their own submitted records; reviewer/admin sees all tenant records.
- **Response (200 OK):**
  ```json
  {
    "records": [
      {
        "id": "67...",
        "status": "submitted",
        "sheetStatus": "Pending Review",
        "createdAt": "2026-09-30T10:00:00.000Z",
        "reviewedBy": null,
        "reviewedByName": "",
        "reviewedAt": null,
        "reviewerComment": "",
        "verifiedData": {
          "fullName": "John Doe",
          "companyName": "AeroCorp",
          "jobTitle": "VP Sales",
          "email": "john@example.com",
          "phone": "+1 555-0199",
          "meetingContext": { "metAtLocation": "Exhibition Name" },
          "notes": "Met at booth"
        }
      }
    ]
  }
  ```

#### `PATCH /api/cards?id=:id` (Correct Details)
- **Description:** Used by capturer when a record is marked `correction_requested` to update fields.
- **Request Body:**
  ```json
  {
    "verifiedData": { ... },
    "status": "submitted"
  }
  ```
- **Response (200 OK):** Updated record object.

#### `POST /api/cards?action=duplicate` (Duplicate Pre-Check)
- **Description:** Pre-checks if email, phone, or name+company match an existing contact before submission.
- **Request Body:**
  ```json
  {
    "verifiedData": {
      "fullName": "John Doe",
      "companyName": "AeroCorp",
      "email": "john@example.com",
      "phone": "+1 555-0199"
    }
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "duplicate": null
  }
  ```
  Or if match found:
  ```json
  {
    "duplicate": {
      "id": "67...",
      "createdAt": "2026-09-30T09:00:00.000Z",
      "verifiedData": { "fullName": "John Doe", "companyName": "AeroCorp" }
    }
  }
  ```

#### `GET /api/cards?action=image&id=:id`
- **Description:** Returns base64 image data for high-resolution card viewing (if image retention hasn't expired).

---

### 4.4 Export Endpoint

#### `GET /api/export`
- **Description:** Generates and returns a clean, formula-safe CSV file containing **only Approved contacts**.
- **Headers:** Cookie `cardsnap_session`
- **Response (200 OK):** `Content-Type: text/csv; charset=utf-8`
  ```csv
  "Record ID","Name","Job Title","Company","Email","Phone","Event","Notes","Status","Captured At","Reviewed At","Transfer Status"
  "67...","John Doe","VP Sales","AeroCorp","john@example.com","+1 555-0199","Exhibition Name","Notes","approved","2026-09-30T10:00:00.000Z","2026-09-30T11:00:00.000Z","not_started"
  ```

---

## 5. Potential Future Endpoints (BACKEND TODO - HAROON)

### 5.1 Dynamic Exhibition Config [BACKEND TODO - HAROON]
- **Target Endpoint:** `GET /api/config/exhibitions`
- **Status:** Frontend has a fallback hook in `src/lib/api/exhibitions.ts`. When Haroon adds this endpoint, the dropdown will dynamically populate confirmed exhibition names from backend/Sheet config.
- **Expected Response (200 OK):**
  ```json
  {
    "exhibitions": [
      { "label": "Select exhibition", "value": "" },
      { "label": "Dubai Airshow 2026", "value": "Dubai Airshow 2026" },
      { "label": "MRO Americas 2026", "value": "MRO Americas 2026" }
    ]
  }
  ```

---

## 6. Standard Error Format

All error responses from the backend should adhere to:

```json
{
  "code": "ERROR_CODE_STRING",
  "error": "Human-readable error message."
}
```

The frontend client automatically translates common HTTP codes into friendly, non-technical messages for exhibition staff.
