PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS membership_plans (
  tier TEXT PRIMARY KEY,
  monthly_verdict_limit INTEGER,
  api_access_level TEXT NOT NULL DEFAULT 'standard',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL REFERENCES membership_plans(tier),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_usage_events_member_type_created
  ON usage_events(member_id, event_type, created_at);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rel_type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  plaintiff_name TEXT NOT NULL,
  defendant_name TEXT NOT NULL,
  plaintiff_quote TEXT NOT NULL,
  defendant_quote TEXT NOT NULL,
  drama INTEGER NOT NULL DEFAULT 0,
  blame INTEGER NOT NULL DEFAULT 0,
  ruling TEXT NOT NULL DEFAULT '',
  ruling_of TEXT NOT NULL DEFAULT '',
  judge_note TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'local',
  input_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_member_created
  ON cases(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  source_ref TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  occurred_at TEXT,
  emotion_labels_json TEXT NOT NULL DEFAULT '[]',
  emotion_intensity INTEGER NOT NULL DEFAULT 0,
  credibility_score REAL NOT NULL DEFAULT 0.5,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_case_created
  ON evidence(case_id, created_at);

CREATE TABLE IF NOT EXISTS emotion_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL DEFAULT '',
  emotion_label TEXT NOT NULL,
  intensity INTEGER NOT NULL DEFAULT 0,
  situation TEXT NOT NULL DEFAULT '',
  behavior TEXT NOT NULL DEFAULT '',
  need TEXT NOT NULL DEFAULT '',
  repair_signal TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emotion_events_case_created
  ON emotion_events(case_id, created_at);

CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL,
  prompt_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verdicts_case_created
  ON verdicts(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cloud_targets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  endpoint_url TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
