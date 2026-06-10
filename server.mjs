import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { config } from "./backend/env.mjs";
import {
  createCase,
  ensureMember,
  getCaseBundle,
  getQuota,
  insertEmotionEvents,
  insertEvidence,
  listCases,
  listCloudTargets,
  openDatabase,
  recordUsage,
  saveVerdict
} from "./backend/database.mjs";
import {
  buildEmotionEvents,
  buildEmotionProfile,
  generateVerdict,
  normalizeCaseData,
  normalizeEvidence
} from "./backend/judge-paw.mjs";
import { getCloudStatus } from "./backend/cloud.mjs";

const db = openDatabase(config.databasePath, config);
const patchedIndex = buildPatchedIndex();

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${config.host}:${config.port}`);

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      sendHtml(response, patchedIndex);
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    sendJson(response, 500, {
      error: "Internal server error.",
      detail: error instanceof Error ? error.message : "unknown"
    });
  }
}).listen(config.port, config.host, () => {
  console.log(`Judge Paw local server: http://${config.host}:${config.port}`);
});

async function routeApi(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      frontend: "original-github-index",
      database: { provider: "sqlite", path: config.databasePath },
      anthropic: { configured: Boolean(config.anthropic.apiKey), model: config.anthropic.model }
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cloud/status") {
    sendJson(response, 200, getCloudStatus(config, listCloudTargets(db)));
    return;
  }

  if (request.method === "GET" && segments[1] === "memberships" && segments[3] === "quota") {
    const member = ensureMember(db, { memberId: segments[2], tier: url.searchParams.get("tier") || undefined });
    sendJson(response, 200, getQuota(db, member.id));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cases") {
    const member = ensureMember(db, {
      memberId: url.searchParams.get("memberId") || "local-demo-member",
      tier: url.searchParams.get("tier") || undefined
    });
    sendJson(response, 200, { cases: listCases(db, member.id, url.searchParams.get("limit") || 20) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cases") {
    const body = await readJson(request);
    const member = ensureMember(db, body.member || {});
    const caseData = normalizeCaseData(body.caseData);
    const caseId = createCase(db, member, { ...body, caseData });
    sendJson(response, 201, { caseId, memberId: member.id });
    return;
  }

  if (request.method === "GET" && segments[1] === "cases" && segments[2]) {
    const member = ensureMember(db, { memberId: url.searchParams.get("memberId") || "local-demo-member" });
    const bundle = getCaseBundle(db, segments[2], member.id);
    if (!bundle) {
      sendJson(response, 404, { error: "Case not found." });
      return;
    }
    sendJson(response, 200, bundle);
    return;
  }

  if (request.method === "POST" && segments[1] === "cases" && segments[2] && segments[3] === "evidence") {
    const body = await readJson(request);
    const member = ensureMember(db, body.member || {});
    const evidence = normalizeEvidence(body.evidence);
    const saved = insertEvidence(db, segments[2], member.id, evidence);
    sendJson(response, 201, { evidence: saved });
    return;
  }

  if (request.method === "POST" && segments[1] === "cases" && segments[2] && segments[3] === "emotion-events") {
    const body = await readJson(request);
    const member = ensureMember(db, body.member || {});
    const saved = insertEmotionEvents(db, segments[2], member.id, Array.isArray(body.events) ? body.events : []);
    sendJson(response, 201, { emotionEvents: saved });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/judge-paw") {
    const body = await readJson(request);
    const result = await handleJudgePaw(body);
    sendJson(response, result.status, result.body);
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function handleJudgePaw(body) {
  const member = ensureMember(db, body.member || { memberId: body.memberId, tier: body.tier });
  const quotaBefore = getQuota(db, member.id);
  if (!quotaBefore.allowed) {
    return {
      status: 402,
      body: {
        error: "Monthly verdict limit reached.",
        quota: quotaBefore
      }
    };
  }

  const caseData = normalizeCaseData(body.caseData);
  const evidenceItems = normalizeEvidence(body.evidence);
  const caseId = createCase(db, member, { ...body, caseData });
  const savedEvidence = insertEvidence(db, caseId, member.id, evidenceItems);
  const emotionProfile = buildEmotionProfile(caseData, savedEvidence);
  const emotionEvents = buildEmotionEvents(caseData, savedEvidence, emotionProfile);
  const savedEmotionEvents = insertEmotionEvents(db, caseId, member.id, emotionEvents);
  const verdict = await generateVerdict(config, {
    ...body,
    caseData,
    evidence: savedEvidence
  });

  saveVerdict(db, caseId, member.id, verdict);
  recordUsage(db, member.id, "verdict", { caseId, source: verdict.source });

  return {
    status: 200,
    body: {
      caseId,
      memberId: member.id,
      caseData: verdict.caseData,
      analysis: verdict.analysis,
      source: verdict.source,
      model: verdict.model,
      quota: getQuota(db, member.id),
      saved: {
        evidenceCount: savedEvidence.length,
        emotionEventCount: savedEmotionEvents.length
      }
    }
  };
}

function readJson(request, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });
    request.on("error", reject);
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function sendHeaders(response, status, contentType) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    "content-type": contentType
  });
}

function sendJson(response, status, payload) {
  sendHeaders(response, status, "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  sendHeaders(response, status, "text/plain; charset=utf-8");
  response.end(text);
}

function sendHtml(response, html) {
  sendHeaders(response, 200, "text/html; charset=utf-8");
  response.end(html);
}

function sendEmpty(response, status) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end();
}

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Could not patch original frontend: ${label}`);
  return text.replace(before, after);
}

function patchTemplate(template) {
  const helper = `
    async function requestJudgePawsCaseData(currentState) {
      const response = await fetch('/api/judge-paw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          relType: currentState.relType,
          evidence: currentState.evidence,
          caseData: currentState.caseData
        })
      });
      if (!response.ok) throw new Error('Judge Paws API failed');
      const payload = await response.json();
      return payload.caseData || currentState.caseData;
    }
`;

  let next = replaceRequired(template, "    function App() {", `${helper}\n    function App() {`, "insert API helper");
  next = replaceRequired(
    next,
    `      const go = useCallback((next) => {
        setState(s => {
          if (next === 'build') return { ...s, caseData: buildCase(s.relType || 'couple') };
          if (next === 'home') return { relType: null, evidence: [], caseData: buildCase('couple') };
          return s;
        });
        setScreen(next);
      }, []);`,
    `      const go = useCallback(async (next) => {
        if (next === 'verdict') {
          try {
            const caseData = await requestJudgePawsCaseData(state);
            setState(s => ({ ...s, caseData }));
          } catch (err) {
            console.warn('Judge Paws API fallback:', err);
          }
          setScreen('verdict');
          return;
        }
        setState(s => {
          if (next === 'build') return { ...s, caseData: buildCase(s.relType || 'couple') };
          if (next === 'home') return { relType: null, evidence: [], caseData: buildCase('couple') };
          return s;
        });
        setScreen(next);
      }, [state]);`,
    "wire verdict API"
  );
  return next;
}

function patchScriptAsset(entry, patcher) {
  let bytes = Buffer.from(entry.data, "base64");
  if (entry.compressed) bytes = gunzipSync(bytes);
  const patched = patcher(bytes.toString("utf8"));
  const nextBytes = entry.compressed ? gzipSync(Buffer.from(patched)) : Buffer.from(patched);
  return { ...entry, data: nextBytes.toString("base64") };
}

function buildPatchedIndex() {
  const lines = readFileSync("index.html", "utf8").split(/\r?\n/);
  const tagStart = String.fromCharCode(60) + "script";
  const manifestIndex = lines.findIndex((line) => line.includes("__bundler/manifest") && line.trim().startsWith(tagStart));
  const templateIndex = lines.findIndex((line) => line.includes("__bundler/template") && line.trim().startsWith(tagStart));
  if (manifestIndex < 0 || templateIndex < 0) throw new Error("Could not find bundled manifest/template.");

  const manifest = JSON.parse(lines[manifestIndex + 1]);
  const appAssetId = "ee3c73fd-b6dc-4856-86bc-71b18c99b664";
  if (manifest[appAssetId]) {
    manifest[appAssetId] = patchScriptAsset(manifest[appAssetId], (source) => source);
    lines[manifestIndex + 1] = JSON.stringify(manifest);
  }
  lines[templateIndex + 1] = JSON.stringify(patchTemplate(JSON.parse(lines[templateIndex + 1])));
  return lines.join("\n");
}
