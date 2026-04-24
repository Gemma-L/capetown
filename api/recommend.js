// api/recommend.js

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not configured in Vercel."
    });
  }

  try {
    const {
      prompt = "",
      time = "",
      date = "",
      from = "The Westin Cape Town",
      moods = "",
      duration = "",
      extra = "",
      language = ""
    } = req.body || {};

    const userText = `${moods} ${extra}`.trim();
    const isEnglish =
      language === "en" ||
      /^[\x00-\x7F]*$/.test(userText) && /[a-zA-Z]{3,}/.test(userText);

    const outputLang = isEnglish ? "English" : "Chinese";

    const systemPrompt = `
You are a smart Cape Town travel advisor.

Return ONLY valid JSON.
Do NOT use markdown.
Do NOT add explanations outside JSON.
The response language must be ${outputLang}.
`;

    const userMessage = `
Current context:
- Current time: ${time}
- Date: ${date}
- Departure point: ${from}
- Available duration: ${duration}
- User preferences: ${moods || "not specified"}
- Extra notes: ${extra || "none"}
- Cape Town winter sunset: around 17:43

Available places:
${prompt}

Recommendation rules:
1. Recommend according to current time and available duration.
2. After 17:43, avoid outdoor mountain, beach, peninsula, and remote activities.
3. After sunset, prioritize safer evening options such as V&A Waterfront, The Watershed, food markets, or nearby indoor/easy activities.
4. If it is close to sunset, recommend only short sunset-friendly options.
5. Give 2–3 suggestions.
6. Be friendly and practical.
7. Give concrete timing.
8. Match the output language: ${outputLang}.

Return exactly this JSON structure:
{
  "intro": "short summary sentence",
  "suggestions": [
    {
      "name": "place name",
      "icon": "emoji",
      "reason": "2-3 friendly sentences",
      "schedule": "specific time plan",
      "tip": "one practical tip",
      "spotId": 0,
      "web": null
    }
  ]
}
`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1600,
        temperature: 0.5,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

    const dataText = await anthropicRes.text();

    if (!anthropicRes.ok) {
      return res.status(502).json({
        error: "Anthropic API request failed.",
        status: anthropicRes.status,
        detail: dataText
      });
    }

    let data;
    try {
      data = JSON.parse(dataText);
    } catch {
      return res.status(502).json({
        error: "Anthropic returned invalid JSON response.",
        raw: dataText
      });
    }

    const raw = data.content?.[0]?.text || "";

    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).json({
        intro:
          outputLang === "English"
            ? "I generated a recommendation, but the format needs checking."
            : "我生成了建议，但格式需要检查。",
        suggestions: [],
        raw,
        parseError: true
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: "Server error.",
      detail: err.message
    });
  }
}
