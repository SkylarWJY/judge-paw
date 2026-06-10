// Judge Paw — backend verdict engine.
// Serves the static site and exposes POST /api/verdict, which calls Claude
// to render a fair, in-persona verdict. The ANTHROPIC_API_KEY stays server-side.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const PORT = process.env.PORT || 4319;
const ROOT = new URL(".", import.meta.url).pathname;
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// ---- The verdict engine ----------------------------------------------------

const SYSTEM = `You are Judge Paw — a beloved, fair-minded animal judge presiding over
the world's first AI relationship court. A couple brings you a dispute; you hear
both sides and deliver a verdict.

Your judicial contract — never break these:
- Be warm, fair, and lightly playful. Never cruel, never dismissive.
- Your reasoning MUST acknowledge at least one valid point from EACH partner, so
  neither walks away feeling unheard.
- Rulings are nuanced and proportional (shared fault), never a flat "A is right".
- The sentence is always a small, kind, concrete make-up action.

Safety gate: if either statement describes abuse, threats, self-harm, or anything
unsafe, do NOT rule. Set safety to "declined", leave ruling/reasoning/sentence as
empty strings, and put a gentle, caring message in "message" pointing them toward
talking to someone they trust or a professional.

For a normal case, set safety to "ok" and leave "message" as an empty string.`;

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    safety: { type: "string", enum: ["ok", "declined"] },
    ruling: { type: "string" },
    reasoning: { type: "string" },
    sentence: { type: "string" },
    message: { type: "string" },
  },
  required: ["safety", "ruling", "reasoning", "sentence", "message"],
};

async function renderVerdict({ topic, partnerA, partnerB }) {
  const a = partnerA || {};
  const b = partnerB || {};
  const userPrompt = `A couple brings a case to your court.

Topic of the dispute: ${topic || "(not specified)"}

${a.name || "Partner A"} says:
"${a.statement}"

${b.name || "Partner B"} says:
"${b.statement}"

Hear them both and deliver your verdict.`;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
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
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
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
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  // --- API: render a verdict ---
  if (req.method === "POST" && req.url === "/api/verdict") {
    try {
      const { topic, partnerA, partnerB } = JSON.parse((await readBody(req)) || "{}");
      if (!partnerA?.statement?.trim() || !partnerB?.statement?.trim()) {
        return sendJSON(res, 400, { error: "Both partners must state their side." });
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        return sendJSON(res, 500, { error: "Server is missing ANTHROPIC_API_KEY — set it and restart (see .env.example)." });
      }
      const verdict = await renderVerdict({ topic, partnerA, partnerB });
      return sendJSON(res, 200, verdict);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return sendJSON(res, 500, { error: "Server is missing a valid ANTHROPIC_API_KEY." });
      }
      console.error(err);
      return sendJSON(res, 500, { error: "Judge Paw could not reach a verdict. Try again." });
    }
  }

  // --- Static files ---
  let path = decodeURIComponent((req.url || "/").split("?")[0]);
  if (path === "/") path = "/try.html";
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
  console.log(`🐾 Judge Paw is in session at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⚠️  Set ANTHROPIC_API_KEY before rendering verdicts (see .env.example).");
  }
});
