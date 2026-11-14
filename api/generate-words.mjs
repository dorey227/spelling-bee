// api/generate-words.mjs
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return res.status(500).json({ error: "DEEPSEEK_API_KEY not set" });

  const body = req.body || {};
  const safeTier = Math.max(1, Math.min(4, Number(body.tier) || 1));
  const safeCount = Math.max(6, Math.min(30, Number(body.count) || 20));
  const isBilingual = !!body.bilingual;

  const tierGuides = {
    1: "common everyday words",
    2: "professional workplace vocabulary",
    3: "commonly misspelled words",
    4: "harder words for confident spellers",
  };

  const system = "You are a friendly English spelling coach for an adult in Australia. Use strictly Australian English. You only output valid JSON.";
  
  let user = "";
  if (isBilingual) {
    user = `Generate ${safeCount} English workplace words that have a clear Spanish translation (cognates or common office terms) for difficulty tier ${safeTier}.
Return JSON: {"words":[{"w":"english_word","es":"Spanish translation","d":"Short English definition","s":"Example sentence with ___"}]}
Rules: strictly Australian English spelling for 'w'. No duplicates. No markdown.`;
  } else {
    user = `Generate ${safeCount} Australian English words for difficulty tier ${safeTier}: ${tierGuides[safeTier]}.
Return JSON: {"words":[{"w":"word","d":"Short definition","s":"Example sentence with ___"}]}
Rules: strictly Australian English. No duplicates. No markdown.`;
  }

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 1.1,
        max_tokens: 2000,
      }),
    });

    if (!r.ok) return res.status(502).json({ error: "DeepSeek error" });
    const data = await r.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    
    // Sanitize
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
