import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export function nowIso() {
  return new Date().toISOString();
}

export function toJson(value) {
  return JSON.stringify(value ?? null);
}

export function fromJson(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function openDatabase(databasePath, config) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(schemaSql);
  seedMembershipPlans(db, config.quotas);
  seedCloudTargets(db, config.cloud);
  return db;
}

function planLimit(value) {
  return value < 0 ? null : value;
}

function seedMembershipPlans(db, quotas) {
  const stmt = db.prepare(`
    INSERT INTO membership_plans (tier, monthly_verdict_limit, api_access_level, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tier) DO UPDATE SET
      monthly_verdict_limit = excluded.monthly_verdict_limit,
      api_access_level = excluded.api_access_level,
      notes = excluded.notes
  `);

  stmt.run("free", planLimit(quotas.free), "limited", "Local default anonymous plan.");
  stmt.run("member", planLimit(quotas.member), "standard", "Paid member plan with monthly quota.");
  stmt.run("pro", planLimit(quotas.pro), "priority", "Unlimited local plan; enforce billing in production.");
}

function seedCloudTargets(db, cloud) {
  const timestamp = nowIso();
  const stmt = db.prepare(`
    INSERT INTO cloud_targets (id, provider, kind, name, status, endpoint_url, config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      endpoint_url = excluded.endpoint_url,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    "aws-rest-api",
    "aws",
    "server",
    cloud.aws.backendTarget,
    cloud.aws.apiEndpoint ? "configured" : "local-placeholder",
    cloud.aws.apiEndpoint,
    toJson({ region: cloud.aws.region, target: cloud.aws.backendTarget }),
    timestamp,
    timestamp
  );
  stmt.run(
    "cloudflare-d1",
    "cloudflare",
    "database",
    cloud.cloudflare.d1DatabaseName,
    cloud.cloudflare.d1DatabaseId ? "configured" : "local-placeholder",
    cloud.cloudflare.workerEndpoint,
    toJson({
      accountIdConfigured: Boolean(cloud.cloudflare.accountId),
      d1DatabaseIdConfigured: Boolean(cloud.cloudflare.d1DatabaseId)
    }),
    timestamp,
    timestamp
  );
}

export function ensureMember(db, input = {}) {
  const id = cleanId(input.memberId || input.id || "local-demo-member");
  const displayName = cleanText(input.displayName || input.name, "Local Demo Member");
  const tier = cleanTier(input.tier || "free");
  const timestamp = nowIso();
  const existing = db.prepare("SELECT * FROM members WHERE id = ?").get(id);

  if (!existing) {
    db.prepare(`
      INSERT INTO members (id, display_name, tier, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, displayName, tier, toJson({ local: true }), timestamp, timestamp);
  } else if (input.tier && cleanTier(input.tier) !== existing.tier) {
    db.prepare("UPDATE members SET tier = ?, updated_at = ? WHERE id = ?").run(tier, timestamp, id);
  }

  return db.prepare(`
    SELECT members.*, membership_plans.monthly_verdict_limit, membership_plans.api_access_level
    FROM members
    JOIN membership_plans ON membership_plans.tier = members.tier
    WHERE members.id = ?
  `).get(id);
}

export function getQuota(db, memberId, eventType = "verdict", date = new Date()) {
  const member = ensureMember(db, { memberId });
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM usage_events
    WHERE member_id = ? AND event_type = ? AND created_at >= ?
  `).get(member.id, eventType, monthStart);
  const used = Number(row?.count || 0);
  const limit = member.monthly_verdict_limit === null ? null : Number(member.monthly_verdict_limit);
  return {
    memberId: member.id,
    tier: member.tier,
    eventType,
    monthStart,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    allowed: limit === null || used < limit
  };
}

export function recordUsage(db, memberId, eventType, metadata = {}) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO usage_events (id, member_id, event_type, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), memberId, eventType, timestamp, toJson(metadata));
}

export function createCase(db, member, input) {
  const timestamp = nowIso();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO cases (
      id, member_id, rel_type, status, title, plaintiff_name, defendant_name,
      plaintiff_quote, defendant_quote, drama, blame, ruling, ruling_of, judge_note,
      caption, source, input_json, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    member.id,
    cleanText(input.relType, "couple"),
    "pending",
    cleanText(input.title, "Untitled relationship case"),
    input.caseData.plaintiff.name,
    input.caseData.defendant.name,
    input.caseData.plaintiff.quote,
    input.caseData.defendant.quote,
    input.caseData.drama,
    input.caseData.blame,
    input.caseData.ruling,
    input.caseData.rulingOf,
    input.caseData.judgeNote,
    input.caseData.caption,
    "local",
    toJson(input),
    "{}",
    timestamp,
    timestamp
  );
  return id;
}

export function insertEvidence(db, caseId, memberId, evidenceItems) {
  const timestamp = nowIso();
  const stmt = db.prepare(`
    INSERT INTO evidence (
      id, case_id, member_id, kind, label, source_ref, text, occurred_at,
      emotion_labels_json, emotion_intensity, credibility_score, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return evidenceItems.map((item) => {
    const id = randomUUID();
    stmt.run(
      id,
      caseId,
      memberId,
      item.kind,
      item.label,
      item.sourceRef,
      item.text,
      item.occurredAt || null,
      toJson(item.emotionLabels),
      item.emotionIntensity,
      item.credibilityScore,
      toJson(item.metadata),
      timestamp
    );
    return { ...item, id, caseId, memberId, createdAt: timestamp };
  });
}

export function insertEmotionEvents(db, caseId, memberId, events) {
  const timestamp = nowIso();
  const stmt = db.prepare(`
    INSERT INTO emotion_events (
      id, case_id, member_id, evidence_id, actor_label, emotion_label, intensity,
      situation, behavior, need, repair_signal, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return events.map((event) => {
    const id = randomUUID();
    stmt.run(
      id,
      caseId,
      memberId,
      event.evidenceId || null,
      event.actorLabel,
      event.emotionLabel,
      event.intensity,
      event.situation,
      event.behavior,
      event.need,
      event.repairSignal,
      toJson(event.metadata),
      timestamp
    );
    return { ...event, id, caseId, memberId, createdAt: timestamp };
  });
}

export function saveVerdict(db, caseId, memberId, verdict) {
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO verdicts (id, case_id, member_id, source, model, prompt_version, prompt_json, response_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    caseId,
    memberId,
    verdict.source,
    verdict.model || "",
    verdict.promptVersion,
    toJson(verdict.prompt),
    toJson(verdict.response),
    timestamp
  );

  const caseData = verdict.caseData;
  db.prepare(`
    UPDATE cases SET
      status = ?,
      drama = ?,
      blame = ?,
      ruling = ?,
      ruling_of = ?,
      judge_note = ?,
      caption = ?,
      source = ?,
      result_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    "verdict_ready",
    caseData.drama,
    caseData.blame,
    caseData.ruling,
    caseData.rulingOf,
    caseData.judgeNote,
    caseData.caption,
    verdict.source,
    toJson(verdict),
    timestamp,
    caseId
  );
}

export function listCases(db, memberId, limit = 20) {
  return db.prepare(`
    SELECT id, member_id, rel_type, status, title, plaintiff_name, defendant_name,
      drama, blame, ruling, ruling_of, source, created_at, updated_at
    FROM cases
    WHERE member_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(memberId, Math.max(1, Math.min(100, Number(limit) || 20)));
}

export function getCaseBundle(db, caseId, memberId) {
  const row = db.prepare("SELECT * FROM cases WHERE id = ? AND member_id = ?").get(caseId, memberId);
  if (!row) return null;
  return {
    case: {
      ...row,
      input: fromJson(row.input_json, {}),
      result: fromJson(row.result_json, {})
    },
    evidence: db.prepare("SELECT * FROM evidence WHERE case_id = ? ORDER BY created_at ASC").all(caseId),
    emotionEvents: db.prepare("SELECT * FROM emotion_events WHERE case_id = ? ORDER BY created_at ASC").all(caseId),
    verdicts: db.prepare("SELECT * FROM verdicts WHERE case_id = ? ORDER BY created_at DESC").all(caseId)
  };
}

export function listCloudTargets(db) {
  return db.prepare("SELECT * FROM cloud_targets ORDER BY provider, kind").all().map((row) => ({
    ...row,
    config: fromJson(row.config_json, {})
  }));
}

function cleanText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : fallback;
}

function cleanId(value) {
  const text = cleanText(String(value || ""), "local-demo-member");
  return text.replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 120) || "local-demo-member";
}

function cleanTier(value) {
  return ["free", "member", "pro"].includes(value) ? value : "free";
}
