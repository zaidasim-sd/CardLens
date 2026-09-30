export function getEmptyFields() {
  return {
    fullName: "",
    jobTitle: "",
    companyName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    website: "",
    address: "",
    city: "",
    country: "",
    notes: "",
  };
}

// Known Cities & Countries for auto-detection
const CITY_COUNTRY_MAP = {
  "karachi": { city: "Karachi", country: "Pakistan" },
  "lahore": { city: "Lahore", country: "Pakistan" },
  "islamabad": { city: "Islamabad", country: "Pakistan" },
  "rawalpindi": { city: "Rawalpindi", country: "Pakistan" },
  "faisalabad": { city: "Faisalabad", country: "Pakistan" },
  "peshawar": { city: "Peshawar", country: "Pakistan" },
  "quetta": { city: "Quetta", country: "Pakistan" },
  "multan": { city: "Multan", country: "Pakistan" },
  "sialkot": { city: "Sialkot", country: "Pakistan" },
  "gujranwala": { city: "Gujranwala", country: "Pakistan" },
  "hyderabad": { city: "Hyderabad", country: "Pakistan" },
  "abbottabad": { city: "Abbottabad", country: "Pakistan" },
  "dubai": { city: "Dubai", country: "United Arab Emirates" },
  "abu dhabi": { city: "Abu Dhabi", country: "United Arab Emirates" },
  "sharjah": { city: "Sharjah", country: "United Arab Emirates" },
  "riyadh": { city: "Riyadh", country: "Saudi Arabia" },
  "jeddah": { city: "Jeddah", country: "Saudi Arabia" },
  "doha": { city: "Doha", country: "Qatar" },
  "muscat": { city: "Muscat", country: "Oman" },
  "london": { city: "London", country: "United Kingdom" },
  "manchester": { city: "Manchester", country: "United Kingdom" },
  "new york": { city: "New York", country: "United States" },
  "san francisco": { city: "San Francisco", country: "United States" },
  "toronto": { city: "Toronto", country: "Canada" },
  "sydney": { city: "Sydney", country: "Australia" },
  "singapore": { city: "Singapore", country: "Singapore" },
  "tokyo": { city: "Tokyo", country: "Japan" },
  "berlin": { city: "Berlin", country: "Germany" },
  "paris": { city: "Paris", country: "France" }
};

const COUNTRIES = [
  { name: "Pakistan", keywords: ["pakistan", "pk"] },
  { name: "United Arab Emirates", keywords: ["uae", "united arab emirates", "dubai", "abu dhabi"] },
  { name: "Saudi Arabia", keywords: ["saudi arabia", "ksa", "saudi"] },
  { name: "United States", keywords: ["usa", "united states", "u.s.a.", "us"] },
  { name: "United Kingdom", keywords: ["uk", "united kingdom", "u.k.", "england"] },
  { name: "Canada", keywords: ["canada"] },
  { name: "Australia", keywords: ["australia"] },
  { name: "Germany", keywords: ["germany"] },
  { name: "France", keywords: ["france"] }
];


// Service & Tagline keywords
const TAGLINE_KEYWORDS = [
  "software", "web & app", "web development", "app development", "dashboards",
  "custom software", "cloud", "consulting", "design", "digital marketing",
  "solutions", "services", "infrastructure", "analytics", "ui/ux", "ai & ml",
  "mobile apps", "web apps", "cyber security", "data analytics"
];

function isTaglineLine(line) {
  const lineLower = line.toLowerCase();
  // Check if line contains bullet points or separators AND tagline keywords
  const hasSeparators = lineLower.includes("•") || lineLower.includes("|") || lineLower.includes("-") || lineLower.includes("&");
  const keywordCount = TAGLINE_KEYWORDS.filter(k => lineLower.includes(k)).length;

  if (hasSeparators && keywordCount >= 1) return true;
  if (keywordCount >= 2) return true;
  return false;
}

export function parseOCRText(text) {
  if (!text) return getEmptyFields();

  const fields = getEmptyFields();

  // ── Step 1: Pre-process lines & split by inline delimiters (| , • , ;) ──
  const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const tokens = [];
  for (const line of rawLines) {
    // If the entire line is a tagline / service list, discard it immediately
    if (isTaglineLine(line)) {
      continue; // User rule: tagline of company should NOT be added in any field
    }

    // If line contains inline delimiters like | or multiple spaces, split into sub-tokens
    if (line.includes("|") || line.includes("•") || /\s{3,}/.test(line)) {
      const parts = line.split(/(?:\||•|\s{3,})/).map(p => p.trim()).filter(Boolean);
      tokens.push(...parts);
    } else {
      tokens.push(line);
    }
  }

  const remainingTokens = [...tokens];

  // Helper to remove a used token
  const consumeToken = (index) => {
    if (index >= 0 && index < remainingTokens.length) {
      remainingTokens.splice(index, 1);
    }
  };

  // ── Step 2: Extract Email Address ──
  const emailRegex = /(?:email\s*[:\-\s]*)?([a-zA-Z0-9._%+-]+(?:\s*\.\s*[a-zA-Z0-9._%+-]+)*\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,})/i;

  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const match = token.match(emailRegex);
    if (match) {
      // Clean internal spaces from OCR artifacts
      fields.email = match[1].replace(/\s+/g, "").toLowerCase();
      consumeToken(i);
      break;
    }
  }

  // ── Step 3: Extract Phone & Alternate Phone Numbers ──
  // Supports international (+92-319-1980857, +1 800...), local (0319-1980857), and labelled (WhatsApp:, Tel:, Mob:)
  const phoneLabelRegex = /\b(?:whatsapp|tel|phone|mob|mobile|cell|ph|fax)\s*[:\-\s]*/i;
  const phonePattern = /\+?\d[\d ().-]{5,}\d/;

  let phoneCount = 0;
  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const hasPhoneLabel = phoneLabelRegex.test(token);
    const hasDigits = (token.match(/\d/g) || []).length >= 7;

    if (hasPhoneLabel || (hasDigits && phonePattern.test(token))) {
      // Clean phone number: remove labels like "WhatsApp: ", "Email: ", trailing artifact digits
      let cleanPhone = token.replace(phoneLabelRegex, "").trim();
      // Extract the actual numeric phone part
      const phoneMatch = cleanPhone.match(phonePattern);
      if (phoneMatch) {
        cleanPhone = phoneMatch[0].trim();
      }

      if (phoneMatch && cleanPhone.replace(/\D/g, '').length >= 7 && cleanPhone.replace(/\D/g, '').length <= 15) {
        if (phoneCount === 0) {
          fields.phone = cleanPhone;
          phoneCount++;
          consumeToken(i);
          i--;
        } else if (phoneCount === 1) {
          fields.alternatePhone = cleanPhone;
          phoneCount++;
          consumeToken(i);
          i--;
        }
      }
    }
  }

  // ── Step 4: Extract Website URL ──
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i;

  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    if (
      !token.includes("@") &&
      (token.toLowerCase().includes("www.") || token.toLowerCase().includes("http") || urlRegex.test(token))
    ) {
      const match = token.match(urlRegex);
      if (match) {
        let cleanUrl = match[0].replace(/^(?:web|website)\s*[:\-\s]*/i, "").trim();
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          cleanUrl = "www." + cleanUrl.replace(/^www\./i, "");
        }
        fields.website = cleanUrl;
        consumeToken(i);
        break;
      }
    }
  }

  // ── Step 5: Discard Any Remaining Taglines / Service Tokens ──
  for (let i = remainingTokens.length - 1; i >= 0; i--) {
    if (isTaglineLine(remainingTokens[i])) {
      consumeToken(i);
    }
  }

  // ── Step 6: Extract Job Title ──
  const titleKeywords = [
    "chief executive officer", "chief technical officer", "chief operating officer",
    "managing director", "data engineer", "software engineer", "full stack developer",
    "frontend developer", "backend developer", "project manager", "product manager",
    "ceo", "cto", "cfo", "coo", "director", "president", "founder", "co-founder",
    "vp", "vice president", "executive", "engineer", "developer", "consultant",
    "manager", "lead", "architect", "analyst", "designer", "specialist", "officer"
  ];

  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const tokenLower = token.toLowerCase();

    if (titleKeywords.some(keyword => tokenLower.includes(keyword))) {
      // Ensure it's not a company name line like "Custom Software Development"
      if (!tokenLower.startsWith("head office") && !tokenLower.startsWith("office")) {
        fields.jobTitle = token;
        consumeToken(i);
        break;
      }
    }
  }

  // ── Step 7: Identify Company Name ──
  // Extract domain from email if present for matching (e.g. "vision71tech" from "zaid.sd@vision71tech.com")
  let domain = "";
  if (fields.email) {
    domain = fields.email.split("@")[1]?.split(".")[0]?.toLowerCase() || "";
  } else if (fields.website) {
    domain = fields.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0]?.toLowerCase() || "";
  }

  const companyKeywords = [
    "technologies", "technology", "software", "solutions", "systems", "corp",
    "corporation", "inc", "incorporated", "ltd", "limited", "llc", "group",
    "holdings", "enterprises", "studio", "labs", "digital", "media", "agency",
    "global", "services", "industries", "vision71", "aviation", "airlines", "aerospace", "airways", "maintenance"
  ];

  const addressPrefixes = ["head office", "office", "address", "street", "plot", "building", "road", "avenue", "flat", "suite", "p.o. box", "96-a", "b-"];

  let companyIndex = -1;

  // First priority: look for company keywords or domain match in remaining tokens
  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const tokenLower = token.toLowerCase();
    const tokenClean = tokenLower.replace(/[^a-z0-9]/g, "");

    // Must NOT be an address line
    if (addressPrefixes.some(pref => tokenLower.startsWith(pref))) continue;

    // Check domain match (e.g. "vision71" matching "vision71tech")
    const matchesDomain = domain && !['example','gmail','outlook','yahoo','hotmail'].includes(domain) && domain.length >= 4 && tokenClean.length >= 4 && (tokenClean.includes(domain) || domain.includes(tokenClean));
    const matchesKeyword = companyKeywords.some(kw => new RegExp(`\\b${kw}\\b`).test(tokenLower));

    if (matchesDomain || matchesKeyword) {
      companyIndex = i;
      break;
    }
  }

  if (companyIndex !== -1) {
    let rawCompany = remainingTokens[companyIndex];
    fields.companyName = rawCompany.replace(/™|®|©/g, "").replace(/\s+/g, " ").trim();
    consumeToken(companyIndex);

    // Look for adjacent company suffix token (e.g. "VISION71" + "TECHNOLOGIES")
    for (let i = remainingTokens.length - 1; i >= 0; i--) {
      const tok = remainingTokens[i];
      const tokLower = tok.toLowerCase();
      if (
        companyKeywords.some(kw => new RegExp(`\\b${kw}\\b`).test(tokLower)) &&
        !addressPrefixes.some(p => tokLower.startsWith(p))
      ) {
        fields.companyName = `${fields.companyName} ${tok}`.replace(/™|®|©/g, "").replace(/\s+/g, " ").trim();
        consumeToken(i);
        break;
      }
    }
  }

  // ── Step 8: Identify Full Name ──
  // Name usually comes first among remaining non-address tokens
  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const tokenLower = token.toLowerCase();

    // Check if token looks like a full name (2-4 words, no numbers, not address/office)
    const isAddress = addressPrefixes.some(p => tokenLower.startsWith(p)) || /\d+/.test(token);
    const words = token.split(/\s+/);
    if (!isAddress && words.length >= 1 && words.length <= 4 && /^[a-zA-Z\s.'-]+$/.test(token)) {
      fields.fullName = token;
      consumeToken(i);
      break;
    }
  }

  // ── Step 9: Address, City, Country Extraction ──
  const addressParts = [];
  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    // Strip "Head Office:" or "Address:" prefixes
    const cleanToken = token.replace(/^(?:head office|office|address|addr)\s*[:\-\s]*/i, "").trim();
    if (cleanToken) {
      addressParts.push(cleanToken);
    }
  }

  if (addressParts.length > 0) {
    // Join remaining lines as address
    fields.address = addressParts.join(", ");
  }

  // Auto-detect City and Country from Address or Full Raw Text
  const fullTextToSearch = `${fields.address} ${text}`;

  // 1. City & Country Auto-Extraction via CITY_COUNTRY_MAP
  for (const [key, item] of Object.entries(CITY_COUNTRY_MAP)) {
    const cityRegex = new RegExp(`\\b${key}\\b`, "i");
    if (cityRegex.test(fullTextToSearch)) {
      fields.city = item.city;
      if (!fields.country) {
        fields.country = item.country;
      }
      break;
    }
  }

  // 2. Country Auto-Extraction fallback
  if (!fields.country) {
    for (const countryObj of COUNTRIES) {
      for (const kw of countryObj.keywords) {
        const countryRegex = new RegExp(`\\b${kw}\\b`, "i");
        if (countryRegex.test(fullTextToSearch)) {
          fields.country = countryObj.name;
          break;
        }
      }
      if (fields.country) break;
    }
  }


  // Clean address format trailing commas/dots
  if (fields.address) {
    fields.address = fields.address.replace(/,\s*,/g, ",").replace(/^,\s*/, "").trim();
  }

  return fields;
}


