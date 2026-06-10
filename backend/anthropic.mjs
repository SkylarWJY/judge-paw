export function stripJsonFences(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function callClaude(config, { system, prompt, maxTokens = 900, temperature = 0.35 }) {
  if (!config.anthropic.apiKey) {
    return { ok: false, source: "fallback", reason: "missing_api_key" };
  }

  try {
    const response = await fetch(config.anthropic.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": config.anthropic.version
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        source: "fallback",
        reason: `anthropic_status_${response.status}`,
        model: config.anthropic.model
      };
    }

    const payload = await response.json();
    const text = payload.content?.find((block) => block?.type === "text")?.text;
    if (!text) {
      return { ok: false, source: "fallback", reason: "missing_text", model: config.anthropic.model };
    }

    return {
      ok: true,
      source: "anthropic",
      model: config.anthropic.model,
      text,
      raw: payload
    };
  } catch (error) {
    return {
      ok: false,
      source: "fallback",
      reason: error instanceof Error ? error.message : "anthropic_error",
      model: config.anthropic.model
    };
  }
}
