// api/recommend.js
// Vercel serverless function — 代理 Anthropic API，Key 安全存在环境变量里

export default async function handler(req, res) {
  // CORS: 允许你的 GitHub Pages 域名访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 从环境变量读取 API Key（不暴露给前端）
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { prompt, time, date, from, moods, duration, extra } = req.body;

    // 构建发给 Claude 的系统提示和用户消息
    const systemPrompt = `你是一个开普敦旅行顾问，性格像朋友一样轻松亲切。
只返回合法 JSON，不要有任何额外文字、markdown 代码块或解释。`;

    const userMessage = `
【当前情况】
- 现在时间：${time}
- 今天日期：${date}（6月，开普敦冬季）
- 今日日落：17:43（6月开普敦天黑很早！）
- 出发地点：${from}
- 可用时间：${duration}
- 想要的体验：${moods || '随意'}
- 补充信息：${extra || '无'}

【所有可去景点】
${prompt}

【规则】
1. 日落 17:43 是硬约束。如果现在是 ${time}，算一下几点能回来，超过日落就不推荐户外活动
2. 如果现在已经过了 17:43，推荐夜间室内活动（V&A、Camps Bay 餐厅）
3. 如果临近日落（16:00-17:43），优先推荐 Signal Hill 看夕阳
4. 语气要像朋友聊天，不要像旅游手册
5. 时间安排要具体（XX:XX 出发 → XX:XX 到达）

返回 JSON：
{
  "intro": "一句话概括今天适合什么",
  "suggestions": [
    {
      "name": "景点名称",
      "icon": "emoji",
      "reason": "为什么现在去特别好（2-3句口语化）",
      "schedule": "具体时间安排，如 14:00 出发 → 14:15 到达 → 游览约2小时 → 16:30 返回",
      "tip": "一个贴心小提示",
      "spotId": 景点id数字（没有填-1）,
      "web": "官网链接或null"
    }
  ]
}`;

    // 调用 Anthropic API
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return res.status(502).json({ error: `Anthropic API error: ${anthropicRes.status}`, detail: err });
    }

    const data = await anthropicRes.json();
    const raw = data.content?.[0]?.text || '';

    // 清理并解析 JSON（防止 Claude 偶尔加了 markdown）
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // 如果 JSON 解析失败，返回原始文本让前端处理
      return res.status(200).json({ raw, parseError: true });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
