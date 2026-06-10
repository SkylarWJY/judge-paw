// Judge Paws — backend trial engine.
// Serves the static app and exposes POST /api/trials, which calls Claude to
// render a full case object that drops straight into the frontend's caseData.
// The ANTHROPIC_API_KEY stays server-side.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const PORT = process.env.PORT || 4319;
const ROOT = new URL(".", import.meta.url).pathname;
const APP_ENTRY = "/app/Judge%20Paws%20Landing.html";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// ---- The trial engine ------------------------------------------------------

const SYSTEM = `You are Judge Paws — the presiding (and very cute) AI judge of the world's
first AI Relationship Court. It is a playful, viral, entertainment product: people
bring a relationship dispute and you deliver a verdict that is funny, shareable, and
secretly fair. Think internet-meme courtroom, not real legal advice.

Given a relationship type and any submitted "evidence", invent a vivid, specific case
and return a complete verdict. Rules:
- Be witty and warm. Puns encouraged (paws/guilty/ruff). Never mean-spirited or cruel.
- The verdict must feel BALANCED: the judgeNote should land a fair point on BOTH parties,
  even when one is "found guilty". Nobody should feel purely dunked on.
- Two parties with fun first names, a fitting emoji each, a role label, a 0–100
  "relationship credit score", and a punchy one-line quote (in their own voice).
- "drama" 0–100, "blame" 0–100 (the DEFENDANT's share of fault).
- 3–5 redFlags (short punchy phrases) and 1–3 greenFlags.
- "ruling": a short ALL-CAPS punny verdict, e.g. "PAW-SITIVELY GUILTY".
- "rulingOf": MUST be exactly one of the two party names (the one the ruling is about).
- "judgeNote": 2–3 sentences, funny but fair, ending in a light shared "sentence".
- "caption": a ready-to-post viral social caption with emoji.
If the evidence describes anything genuinely unsafe (abuse, threats, self-harm), drop the
comedy: keep it kind and gentle, and route them toward someone they trust.`;

const PARTY = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    emoji: { type: "string" },
    role: { type: "string" },
    score: { type: "integer" },
    quote: { type: "string" },
  },
  required: ["name", "emoji", "role", "score", "quote"],
};

const CASE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    plaintiff: PARTY,
    defendant: PARTY,
    drama: { type: "integer" },
    blame: { type: "integer" },
    redFlags: { type: "array", items: { type: "string" } },
    greenFlags: { type: "array", items: { type: "string" } },
    ruling: { type: "string" },
    rulingOf: { type: "string" },
    judgeNote: { type: "string" },
    caption: { type: "string" },
  },
  required: ["plaintiff", "defendant", "drama", "blame", "redFlags",
    "greenFlags", "ruling", "rulingOf", "judgeNote", "caption"],
};

async function renderTrial({ relationshipType, evidence }) {
  const ev = Array.isArray(evidence) && evidence.length
    ? evidence.map((e) => `- ${e.label || "evidence"}${e.text ? `: ${e.text}` : ""}`).join("\n")
    : "(no specific evidence submitted — invent a juicy, relatable case)";

  const userPrompt = `New case filed.

Relationship type: ${relationshipType || "couple"}

Evidence on file:
${ev}

Hold court and return the full verdict.`;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema: CASE_SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No verdict returned");
  return JSON.parse(textBlock.text);
}

// ---- HTTP plumbing ---------------------------------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  // --- API: render a trial verdict ---
  if (req.method === "POST" && req.url === "/api/trials") {
    try {
      const { relationshipType, evidence } = JSON.parse((await readBody(req)) || "{}");
      if (!process.env.ANTHROPIC_API_KEY) {
        return sendJSON(res, 500, { error: "Server is missing ANTHROPIC_API_KEY — set it and restart (see .env.example)." });
      }
      const verdict = await renderTrial({ relationshipType, evidence });
      return sendJSON(res, 200, verdict);
    } catch (err) {
      console.error(err);
      return sendJSON(res, 500, { error: "Judge Paws could not reach a verdict. Try again." });
    }
  }

  // --- Redirect root to the app ---
  if (req.url === "/" || req.url === "") {
    res.writeHead(302, { location: APP_ENTRY });
    return res.end();
  }

  // --- Static files ---
  let path = decodeURIComponent((req.url || "/").split("?")[0]);
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, safe);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`🐾 Judge Paws is in session at http://localhost:${PORT}`);
  console.log(`   App: http://localhost:${PORT}${APP_ENTRY}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  Set ANTHROPIC_API_KEY before holding trials (see .env.example).");
  }
});
