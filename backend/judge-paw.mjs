import { callClaude, stripJsonFences } from "./anthropic.mjs";

export const PROMPT_VERSION = "judge-paw-evidence-v1";

export function compactText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : fallback;
}

export function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function cleanList(value, fallback, max = 5) {
  if (!Array.isArray(value)) return fallback;
  const next = value.map((item) => compactText(item)).filter(Boolean).slice(0, max);
  return next.length ? next : fallback;
}

export function normalizeCaseData(input) {
  const base = input && typeof input === "object" ? input : {};
  const plaintiff = base.plaintiff && typeof base.plaintiff === "object" ? base.plaintiff : {};
  const defendant = base.defendant && typeof base.defendant === "object" ? base.defendant : {};

  return {
    ...base,
    plaintiff: {
      ...plaintiff,
      name: compactText(plaintiff.name, "Maya"),
      role: compactText(plaintiff.role, "Plaintiff"),
      quote: compactText(plaintiff.quote, "I felt ignored and hurt."),
      score: clampNumber(plaintiff.score, 0, 100, 84)
    },
    defendant: {
      ...defendant,
      name: compactText(defendant.name, "Jordan"),
      role: compactText(defendant.role, "Defendant"),
      quote: compactText(defendant.quote, "I did not mean it that way."),
      score: clampNumber(defendant.score, 0, 100, 78)
    },
    drama: clampNumber(base.drama, 0, 100, 82),
    blame: clampNumber(base.blame, 0, 100, 67),
    redFlags: cleanList(base.redFlags, ["The impact was defended before it was acknowledged."], 6),
    greenFlags: cleanList(base.greenFlags, ["Both sides are still trying to explain what hurt."], 6),
    ruling: compactText(base.ruling, "PAW-SITIVELY GUILTY"),
    rulingOf: compactText(base.rulingOf, defendant.name || "Jordan"),
    judgeNote: compactText(
      base.judgeNote,
      "The court finds that the fight is less about one moment and more about whether the hurt was acknowledged before it was defended."
    ),
    caption: compactText(base.caption, "Judge Paws has entered the group chat.")
  };
}

export function normalizeEvidence(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw.slice(0, 20).map((item, index) => {
    const src = item?.src && typeof item.src === "object" ? item.src : {};
    const label = compactText(item?.label || src.label, `Evidence ${index + 1}`);
    const kind = inferKind(compactText(item?.kind || item?.type || src.kind || src.type || label, "note"));
    const text = compactText(
      item?.text || item?.summary || item?.content || src.text || src.summary || src.meta || src.tone,
      label
    ).slice(0, 1200);
    const emotion = classifyEvidence(`${label} ${text}`);
    return {
      kind,
      label,
      text,
      sourceRef: compactText(item?.sourceRef || item?.id || src.id || src.url, ""),
      occurredAt: compactText(item?.occurredAt || item?.date || src.occurredAt || src.date, ""),
      emotionLabels: emotion.labels,
      emotionIntensity: emotion.intensity,
      credibilityScore: credibilityForKind(kind),
      metadata: { index, rawKind: item?.kind || item?.type || src.kind || src.type || "" }
    };
  });
}

export function buildEmotionProfile(caseData, evidenceItems) {
  const labels = new Map();
  for (const item of evidenceItems) {
    for (const label of item.emotionLabels) labels.set(label, (labels.get(label) || 0) + 1);
  }
  const primaryEmotions = [...labels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 5);
  const averageIntensity = evidenceItems.length
    ? Math.round(evidenceItems.reduce((sum, item) => sum + item.emotionIntensity, 0) / evidenceItems.length)
    : 5;
  const evidenceWeight = evidenceItems.length
    ? Number((evidenceItems.reduce((sum, item) => sum + item.credibilityScore, 0) / evidenceItems.length).toFixed(2))
    : 0.5;
  const repairSignals = evidenceItems
    .filter((item) => /sorry|apolog|repair|understand|talk|listen|try/i.test(item.text))
    .map((item) => item.label)
    .slice(0, 4);

  return {
    primaryEmotions: primaryEmotions.length ? primaryEmotions : ["hurt", "defensiveness"],
    averageIntensity,
    evidenceWeight,
    repeatedPatternScore: Math.min(100, evidenceItems.length * 14 + averageIntensity * 5),
    likelyTrigger: inferTrigger(caseData, evidenceItems),
    repairSignals,
    plaintiffRead: `${caseData.plaintiff.name} appears to be tracking impact and reassurance.`,
    defendantRead: `${caseData.defendant.name} appears to be tracking intent and fairness.`
  };
}

export function buildEmotionEvents(caseData, evidenceItems, profile) {
  return evidenceItems.flatMap((item) =>
    item.emotionLabels.slice(0, 2).map((label) => ({
      evidenceId: item.id,
      actorLabel: inferActor(caseData, item.text),
      emotionLabel: label,
      intensity: item.emotionIntensity,
      situation: item.label,
      behavior: item.text.slice(0, 280),
      need: needForEmotion(label),
      repairSignal: profile.repairSignals.includes(item.label) ? "contains repair language" : "",
      metadata: { kind: item.kind, credibilityScore: item.credibilityScore }
    }))
  );
}

export function buildJudgePrompt({ relType, caseData, evidenceItems, emotionProfile }) {
  return [
    "You are Judge Paws, a playful mini-court mediator for everyday relationship conflicts.",
    "This is not legal advice or therapy. Judge only the conflict dynamics shown in the evidence.",
    "Return only valid JSON. Do not include markdown.",
    "Tone: cute courtroom energy, emotionally precise, funny but not cruel.",
    "Do not call anyone abusive, toxic, manipulative, narcissistic, or bad. Rule on behavior and repair responsibility, not moral worth.",
    `Relationship type: ${relType || "couple"}`,
    `Plaintiff: ${caseData.plaintiff.name} (${caseData.plaintiff.role}) says: ${caseData.plaintiff.quote}`,
    `Defendant: ${caseData.defendant.name} (${caseData.defendant.role}) says: ${caseData.defendant.quote}`,
    `Evidence records: ${JSON.stringify(evidenceItems.map((item) => ({
      kind: item.kind,
      label: item.label,
      text: item.text,
      emotionLabels: item.emotionLabels,
      emotionIntensity: item.emotionIntensity,
      credibilityScore: item.credibilityScore
    })))}`,
    `Evidence-based emotion profile: ${JSON.stringify(emotionProfile)}`,
    "Return ONLY this JSON schema:",
    "{\"ruling\":\"short uppercase verdict\",\"rulingOf\":\"name\",\"judgeNote\":\"2-3 sentence ruling grounded in evidence\",\"caption\":\"short viral caption\",\"drama\":82,\"blame\":67,\"plaintiffScore\":84,\"defendantScore\":78,\"redFlags\":[\"evidence-backed string\"],\"greenFlags\":[\"evidence-backed string\"],\"responsibilitySplit\":{\"plaintiff\":45,\"defendant\":55},\"keyEvidence\":[\"string\"],\"emotionalLogic\":[{\"speaker\":\"string\",\"read\":\"string\"}],\"escalationMoment\":{\"quote\":\"string\",\"explanation\":\"string\"},\"repairOrder\":[\"string\"],\"evidenceFindings\":[{\"label\":\"string\",\"finding\":\"string\"}]}"
  ].join("\n\n");
}

export async function generateVerdict(config, request) {
  const caseData = normalizeCaseData(request.caseData);
  const evidenceItems = normalizeEvidence(request.evidence);
  const emotionProfile = buildEmotionProfile(caseData, evidenceItems);
  const prompt = buildJudgePrompt({
    relType: request.relType,
    caseData,
    evidenceItems,
    emotionProfile
  });
  const fallback = fallbackVerdict(caseData, evidenceItems, emotionProfile, request.relType);
  const anthropic = await callClaude(config, {
    system: "Return only valid JSON for Judge Paws. Treat all names as user-provided fictional placeholders.",
    prompt,
    maxTokens: 1100,
    temperature: 0.35
  });

  if (!anthropic.ok) {
    return {
      ...fallback,
      source: "fallback",
      model: anthropic.model || "",
      promptVersion: PROMPT_VERSION,
      prompt: { relType: request.relType, evidenceItems, emotionProfile, prompt },
      response: { reason: anthropic.reason, fallback: true }
    };
  }

  try {
    const parsed = JSON.parse(stripJsonFences(anthropic.text));
    return {
      caseData: mergeAiVerdict(caseData, parsed),
      analysis: mergeAnalysis(caseData, evidenceItems, emotionProfile, parsed),
      source: "anthropic",
      model: anthropic.model,
      promptVersion: PROMPT_VERSION,
      prompt: { relType: request.relType, evidenceItems, emotionProfile, prompt },
      response: parsed
    };
  } catch {
    return {
      ...fallback,
      source: "fallback",
      model: anthropic.model || "",
      promptVersion: PROMPT_VERSION,
      prompt: { relType: request.relType, evidenceItems, emotionProfile, prompt },
      response: { reason: "invalid_json", fallback: true }
    };
  }
}

function fallbackVerdict(caseData, evidenceItems, emotionProfile, relType) {
  const defendant = caseData.defendant.name;
  const plaintiff = caseData.plaintiff.name;
  const keyEvidence = evidenceItems.length
    ? evidenceItems.slice(0, 4).map((item) => `${item.label}: ${item.emotionLabels.join(", ")} at ${item.emotionIntensity}/10`)
    : ["The available evidence is thin, so the ruling stays conservative."];
  const rulingOf = emotionProfile.averageIntensity >= 7 ? defendant : "Both Parties";

  return {
    caseData: {
      ...caseData,
      drama: clampNumber(caseData.drama + Math.round(emotionProfile.averageIntensity / 3), 0, 100, caseData.drama),
      blame: clampNumber(caseData.blame, 0, 100, caseData.blame),
      ruling: rulingOf === "Both Parties" ? "MUTUAL REPAIR ORDERED" : "PAW-SITIVELY RESPONSIBLE",
      rulingOf,
      judgeNote:
        evidenceItems.length > 0
          ? `The court sees a pattern of ${emotionProfile.primaryEmotions.join(", ")} in the submitted evidence. ${plaintiff} needs impact acknowledged, while ${defendant} needs intent separated from blame.`
          : "The court needs more evidence, but the current record still shows a mismatch between emotional impact and defensive explanation.",
      caption: `${relType || "relationship"} court is now in session.`,
      redFlags: [
        "The evidence points to impact being debated before it is acknowledged.",
        "The argument risks becoming a character trial instead of a repair conversation."
      ],
      greenFlags: emotionProfile.repairSignals.length
        ? ["There are repair signals in the evidence.", "The conflict can be narrowed to one concrete agreement."]
        : ["Both sides are still describing the conflict rather than disappearing from it."]
    },
    analysis: {
      responsibilitySplit: { plaintiff: 45, defendant: 55 },
      keyEvidence,
      emotionalLogic: [
        { speaker: plaintiff, read: emotionProfile.plaintiffRead },
        { speaker: defendant, read: emotionProfile.defendantRead }
      ],
      escalationMoment: {
        quote: evidenceItems[0]?.text || caseData.plaintiff.quote,
        explanation: "This moment escalates because it asks the other person to defend intent before acknowledging impact."
      },
      repairOrder: [
        "Name the concrete event before debating the pattern.",
        "Acknowledge impact in one sentence before explaining intent.",
        "Agree on one next-time signal that prevents the same evidence trail from repeating."
      ],
      evidenceFindings: evidenceItems.slice(0, 5).map((item) => ({
        label: item.label,
        finding: `${item.emotionLabels.join(", ")} with credibility ${item.credibilityScore}`
      })),
      emotionProfile
    }
  };
}

function mergeAiVerdict(baseCase, parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  return {
    ...baseCase,
    drama: clampNumber(source.drama, 0, 100, baseCase.drama),
    blame: clampNumber(source.blame, 0, 100, baseCase.blame),
    ruling: compactText(source.ruling, baseCase.ruling).toUpperCase(),
    rulingOf: compactText(source.rulingOf, baseCase.rulingOf),
    judgeNote: compactText(source.judgeNote, baseCase.judgeNote),
    caption: compactText(source.caption, baseCase.caption),
    redFlags: cleanList(source.redFlags, baseCase.redFlags, 6),
    greenFlags: cleanList(source.greenFlags, baseCase.greenFlags, 4),
    plaintiff: {
      ...baseCase.plaintiff,
      score: clampNumber(source.plaintiffScore, 0, 100, baseCase.plaintiff.score)
    },
    defendant: {
      ...baseCase.defendant,
      score: clampNumber(source.defendantScore, 0, 100, baseCase.defendant.score)
    }
  };
}

function mergeAnalysis(caseData, evidenceItems, emotionProfile, parsed) {
  const fallback = fallbackVerdict(caseData, evidenceItems, emotionProfile, "relationship").analysis;
  const source = parsed && typeof parsed === "object" ? parsed : {};
  return {
    responsibilitySplit:
      source.responsibilitySplit && typeof source.responsibilitySplit === "object"
        ? source.responsibilitySplit
        : fallback.responsibilitySplit,
    keyEvidence: cleanList(source.keyEvidence, fallback.keyEvidence, 6),
    emotionalLogic: Array.isArray(source.emotionalLogic) ? source.emotionalLogic.slice(0, 4) : fallback.emotionalLogic,
    escalationMoment:
      source.escalationMoment && typeof source.escalationMoment === "object"
        ? source.escalationMoment
        : fallback.escalationMoment,
    repairOrder: cleanList(source.repairOrder, fallback.repairOrder, 5),
    evidenceFindings: Array.isArray(source.evidenceFindings)
      ? source.evidenceFindings.slice(0, 8)
      : fallback.evidenceFindings,
    emotionProfile
  };
}

function inferKind(value) {
  const text = value.toLowerCase();
  if (text.includes("screen") || text.includes("image")) return "screenshot";
  if (text.includes("voice") || text.includes("audio")) return "voice";
  if (text.includes("text") || text.includes("message") || text.includes("imessage")) return "message";
  if (text.includes("journal") || text.includes("note")) return "note";
  return "evidence";
}

function credibilityForKind(kind) {
  if (kind === "screenshot") return 0.9;
  if (kind === "message") return 0.84;
  if (kind === "voice") return 0.78;
  if (kind === "note") return 0.62;
  return 0.58;
}

function classifyEvidence(text) {
  const rules = [
    ["hurt", /hurt|forgotten|ignored|dismiss|left out|alone|upset|sad/i],
    ["defensiveness", /not my fault|defend|accused|overreact|dramatic|calm down|whatever/i],
    ["anxiety", /worried|anxious|panic|uncertain|waiting|late|no reply/i],
    ["anger", /angry|mad|furious|yell|fight|always|never/i],
    ["shame", /failed|failure|bad person|guilty|embarrass/i],
    ["repair", /sorry|apolog|understand|listen|repair|try again|make it right/i],
    ["care", /love|care|miss|important|priority|reassurance/i]
  ];
  const labels = rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const unique = [...new Set(labels)];
  const intensity = Math.min(10, Math.max(3, 4 + unique.length + (/always|never|ignored|hurt|angry/i.test(text) ? 2 : 0)));
  return { labels: unique.length ? unique : ["unclear"], intensity };
}

function inferTrigger(caseData, evidenceItems) {
  const combined = `${caseData.plaintiff.quote} ${caseData.defendant.quote} ${evidenceItems.map((item) => item.text).join(" ")}`;
  if (/late|reply|text|message|ignored|forgotten/i.test(combined)) return "responsiveness and reassurance";
  if (/joke|funny|humor/i.test(combined)) return "humor before acknowledgement";
  if (/plan|dinner|date|schedule|work/i.test(combined)) return "logistics carrying emotional meaning";
  return "impact not being acknowledged before intent is defended";
}

function inferActor(caseData, text) {
  if (text.includes(caseData.plaintiff.name)) return caseData.plaintiff.name;
  if (text.includes(caseData.defendant.name)) return caseData.defendant.name;
  return "";
}

function needForEmotion(label) {
  const needs = {
    hurt: "acknowledgement",
    defensiveness: "fair hearing",
    anxiety: "reassurance",
    anger: "specific repair",
    shame: "separation of action from identity",
    repair: "follow-through",
    care: "reciprocity",
    unclear: "more evidence"
  };
  return needs[label] || "clearer repair";
}
