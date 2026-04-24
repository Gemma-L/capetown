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

    const isEnglish =
      language === "en" ||
      /[a-zA-Z]{4,}/.test(extra) ||
      /[a-zA-Z]{4,}/.test(moods);

    const outputLang = isEnglish ? "English" : "Chinese";

    const systemPrompt = `
You are a smart Cape Town travel advisor.
You must reply only in valid JSON.
No markdown. No explanation outside JSON.
The response language must be ${outputLang}.
`;

    const userMessage = `
Current travel context:
- Current time: ${time}
- Date: ${date}
- Departure point: ${from}
- Available duration: ${duration}
- User preferences / moods: ${moods || "not specified"}
- Extra notes: ${extra || "none"}
- Cape Town winter sunset is around 17:43.

Available places:
${prompt}

Rules:
1. Recommend based on current time and available duration.
2. If it is after 17:43, avoid outdoor mountain/beach activities and suggest safer indoor/evening options.
3. If it is close to sunset, prioritize short sunset-friendly options.
4. Keep the tone friendly, smart, and practical.
5. Give specific timing.
6. Return 2–3 suggestions only.
7. If the user writes in Chinese, reply in Chinese. If the user writes in English, reply in English.

Return exactly this JSON format:
{
  "intro": "one short sentence",
  "suggestions": [
    {
      "name": "place name",
      "icon": "emoji",
      "reason": "2-3 friendly sentences explaining why this fits now",
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
        model: "claude-sonnet-4-6",
        max_tokens: 1600,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      return res.status(502).json({
        error: "Anthropic API request failed.",
        status: anthropicRes.status,
        detail
      });
    }

    const data = await anthropicRes.json();
    const raw = data.content?.[0]?.text || "";

    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(200).json({
        intro: isEnglish
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
