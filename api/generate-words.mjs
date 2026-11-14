// api/generate-words.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return res.status(500).json({ error: "DEEPSEEK_API_KEY not set" });

  const body = req.body || {};
  const safeTier = Math.max(1, Math.min(4, Number(body.tier) || 1));
  const safeCount = Math.max(6, Math.min(30, Number(body.count) || 20));
  const isBilingual = !!body.bilingual;
  const industry = body.industry && body.industry !== "random" ? body.industry : null;
  
  // Massive avoid list built by frontend to stop repeats
  const avoidList = Array.isArray(body.avoid) ? body.avoid.filter(x => typeof x === "string").slice(-300).join(", ") : "";

  const system = "You are a friendly English spelling coach for an adult in Australia. Use strictly Australian English. You only output valid JSON.";
  
  let industryPrompt = industry ? `The words must be highly relevant to the "${industry}" industry.` : "Use general, common workplace words.";
  
  let user = "";
  if (isBilingual) {
    user = `Generate ${safeCount} English workplace words that have a clear Spanish translation for difficulty tier ${safeTier}. ${industryPrompt}
Return JSON: {"words":[{"w":"english_word","es":"Spanish translation","d":"Short English definition","s":"Example sentence with ___"}]}
CRITICAL RULE: Do NOT use any of these words: ${avoidList || "(none)"}. They are already known. You must find entirely new words.`;
  } else {
    user = `Generate ${safeCount} Australian English words for difficulty tier ${safeTier}. ${industryPrompt}
Return JSON: {"words":[{"w":"word","d":"Short definition","s":"Example sentence with ___"}]}
CRITICAL RULE: Do NOT use any of these words: ${avoidList || "(none)"}. They are already known. You must find entirely new words.`;
  }

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 1.25,
        max_tokens: 2000,
      }),
    });

    if (!r.ok) return res.status(502).json({ error: "DeepSeek error" });
    const data = await r.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    
    const seen = new Set();
    const words = (parsed.words || [])
      .map(x => ({
        w: String(x.w || "").toLowerCase().trim(),
        es: x.es ? String(x.es).trim() : "",
        d: String(x.d || "").replace(/["`]/g, "").trim(),
        s: String(x.s || "").trim(),
        t: safeTier,
      }))
      .filter(x => /^[a-z]{3,20}$/.test(x.w) && x.d.length > 3)
      .filter(x => { if (seen.has(x.w)) return false; seen.add(x.w); return true; })
      .slice(0, safeCount);

    return res.status(200).json({ words });
  } catch (e) {
    return res.status(500).json({ error: "Fetch failed" });
  }
}
