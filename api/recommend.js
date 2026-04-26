// api/recommend.js
// Vercel serverless function — 代理 Anthropic API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { time, date, from, moods, duration, people, extra, prompt } = req.body;

    const [hh, mm] = (time || '14:00').split(':').map(Number);
    const nowMins = hh * 60 + mm;
    const sunsetMins = 17 * 60 + 43;
    const isAfterSunset = nowMins >= sunsetMins;
    const isAfter8pm = nowMins >= 20 * 60;
    const remainSunset = sunsetMins - nowMins;
    const isApproachSunset = !isAfterSunset && remainSunset <= 90;
    const peopleCount = people || '3-4人';

    // ── 所有可以玩的游戏（随机抽取）──
    const ALL_GAMES = [
      // 2-4人适合
      { name: '🃏 斗地主', min: 3, max: 4, desc: '国民级扑克，三个人刚刚好，随时可以玩，规则简单上手快', vibe: '竞争' },
      { name: '🀄 麻将', min: 4, max: 4, desc: '四个人凑一桌！开普敦打麻将的感觉一定很奇妙，要是酒店有牌可以借', vibe: '策略' },
      { name: '🃏 UNO', min: 2, max: 10, desc: '手机下载版或者让前台借副牌，随时随地玩，很快能分出胜负', vibe: '欢乐' },
      { name: '✂️ 猜拳升级版', min: 2, max: 99, desc: '石头剪刀布的进阶版，可以玩惩罚版，输了喝一口 MiniBar，简单但超欢乐', vibe: '欢乐' },
      { name: '🎭 你画我猜', min: 3, max: 99, desc: '手机下载 Skribbl.io 或者撕纸来画，不需要道具，人越多越好笑', vibe: '创意' },
      { name: '🔫 谁是卧底', min: 4, max: 12, desc: '人多必玩！手机下载就能玩，一个人拿到不同词，靠描述找出卧底，心理博弈感超强', vibe: '推理' },
      { name: '🎤 歌词接龙', min: 2, max: 99, desc: '一个人唱歌词最后几个字，下一个人接着唱，接不上来罚酒，越来越难越来越好笑', vibe: '欢乐' },
      { name: '📱 真心话大冒险', min: 3, max: 99, desc: '手机转盘决定谁来，选真心话就要如实回答，选大冒险就要完成挑战，经典永不过时', vibe: '刺激' },
      { name: '🧩 剧本杀', min: 4, max: 8, desc: '手机下载剧本杀 APP（推理世界/我是谜），选一个短篇本，两小时高质量社交', vibe: '推理' },
      { name: '🎯 猜数字（Bulls & Cows）', min: 2, max: 4, desc: '各自写一个4位不重复数字，轮流猜，几A几B，纸笔就能玩，锻炼逻辑', vibe: '策略' },
      { name: '🃏 狼人杀', min: 6, max: 12, desc: '手机下载狼人杀 APP，人多刚好！分配身份，狼人猎巫预言家，胡说八道的艺术', vibe: '推理' },
      { name: '🤣 飞花令', min: 2, max: 99, desc: '说一个主题，轮流说含这个字的诗词，说不出来罚喝，考验平时背了多少古诗', vibe: '文化' },
      { name: '🎲 骰子游戏（吹牛）', min: 2, max: 8, desc: '每人5个骰子，盖住猜全桌的数量，Liar\'s Dice，敢不敢挑战对方？', vibe: '心理' },
      { name: '📸 拍照挑战', min: 2, max: 99, desc: '每人出一个刁钻的拍照题目，比如"找到酒店里最奇怪的角度"，评委打分，赢的人不用买早餐', vibe: '创意' },
      { name: '🧠 你比我猜', min: 4, max: 99, desc: '分两队，一个人背对屏幕，队友用肢体语言提示词语，时间内猜对越多越好', vibe: '欢乐' },
      { name: '🃏 升级（拖拉机）', min: 4, max: 4, desc: '国内流行的升级扑克，四人两队，打到A就赢，适合懂规则的老手', vibe: '策略' },
      { name: '📝 心理测试大会', min: 2, max: 99, desc: '手机搜一堆心理测试题，一起做然后对答案，总会发现意想不到的一面', vibe: '温馨' },
      { name: '🎵 音乐盲猜', min: 2, max: 99, desc: 'Spotify/Apple Music 随机放3秒，谁先猜出歌名/歌手就得分，可以按主题（华语/英语/KTV金曲）', vibe: '欢乐' },
    ];

    // 根据人数筛选适合的游戏
    const parseCount = (p) => {
      if (!p) return 4;
      if (p.includes('1')) return 1;
      if (p.includes('2')) return 2;
      if (p.includes('3-4')) return 4;
      if (p.includes('5-6')) return 6;
      if (p.includes('6+') || p.includes('6人以上')) return 8;
      return 4;
    };
    const n = parseCount(peopleCount);
    const suitableGames = ALL_GAMES.filter(g => n >= g.min && n <= g.max);
    // 随机抽3个
    const shuffled = suitableGames.sort(() => Math.random() - 0.5);
    const pickedGames = shuffled.slice(0, 3);
    const gamesText = pickedGames.map(g =>
      `${g.name}（适合${g.min}-${g.max === 99 ? '多' : g.max}人，${g.vibe}风格）：${g.desc}`
    ).join('\n');

    // ── Westin 酒店设施 ──
    const westinInfo = `
🍸 Raleigh's Lounge & Cigar Bar - 室内酒吧，威士忌/干邑/调酒，沙发卡座，适合朋友深夜畅聊
🍽️ Thirty7 Showkitchen - 南非风格料理，开放式厨房，晚餐氛围极佳
🌃 Louis B's Terrace - 户外露台，俯瞰运河夜景，适合聚餐
🏊 顶楼泳池 + Jacuzzi按摩浴缸 - 俯瞰V&A Waterfront海湾夜景（早6am开放）
🧖 Heavenly Spa - 按摩、面部护理，营业到晚上9-10点，预约：+27 21 412 9999
🏋️ WestinWORKOUT 健身房 - 24小时开放
🛎️ 24小时 Room Service - 直接点到房间
🎮 房间内 - Netflix+MiniBar+高速WiFi，适合开桌游或小型聚会`;

    const systemPrompt = `你是一个开普敦旅行顾问，像老朋友一样亲切、幽默、直接，用中文。
只返回合法 JSON，绝对不要有任何额外文字、markdown代码块或解释。`;

    let userMessage;

    if (isAfter8pm) {
      // ── 晚上8点后：Westin + 游戏推荐 ──
      userMessage = `
【当前情况】
- 现在时间：${time}（晚上8点后，外面天黑景点关了）
- 今天日期：${date}，开普敦6月冬季
- 你们有：${peopleCount}
- 可用时间：${duration}
- 心情：${moods || '随意'}
- 大家说：「${extra || '无'}」

【Westin酒店内可以去的地方】
${westinInfo}

【今晚随机推荐的游戏（${peopleCount}适合玩的）】
${gamesText}

请给出3个建议，综合考虑：
1. 必须有至少1个游戏建议（从上面随机推荐的游戏里选，介绍怎么玩、在哪玩更有趣）
2. 根据「${extra || '无'}」和人数「${peopleCount}」智能判断需求：
   - "想喝酒/来一杯" → 去 Raleigh's Bar，顺便玩游戏
   - "累了/不想动" → Room Service + 房间游戏
   - "想放松" → Spa + 泡Jacuzzi
   - 人多（5人以上）→ 推荐 Raleigh's Bar 包桌或 Louis B's 露台，玩谁是卧底/狼人杀
   - 人少（2-3人）→ 推荐温馨的房间游戏或Spa

返回 JSON：
{
  "intro": "一句话，承认天黑了，但语气轻松有趣，提到${peopleCount}玩什么，直接呼应大家说的「${extra || '随便'}」",
  "suggestions": [
    {
      "name": "活动/游戏名称",
      "icon": "emoji",
      "reason": "为什么现在适合，直接呼应大家说的话和人数，2-3句口语化有趣",
      "schedule": "具体怎么安排：几点+在哪+怎么开始+细节",
      "tip": "贴心提示（游戏规则简介、预约电话、推荐单品、注意事项）",
      "spotId": -1,
      "web": "https://www.marriott.com/en-us/hotels/cptwi-the-westin-cape-town/overview/"
    }
  ]
}`;
    } else {
      // ── 白天/傍晚：正常景点推荐 ──
      userMessage = `
【当前情况】
- 现在时间：${time}（${isAfterSunset ? '日落已过，天黑了' : isApproachSunset ? `⚠️ 日落快到！还有${Math.round(remainSunset)}分钟` : '白天，时间充裕'}）
- 今天日期：${date}（6月，开普敦冬季）
- 今日日落：17:43（硬约束！）
- 你们有：${peopleCount}
- 出发地点：${from}
- 可用时间：${duration}
- 心情：${moods || '随意'}
- 大家说：「${extra || '无'}」

【可去的景点】
${prompt}

【规则】
1. 算好来回时间，确保17:43前能回来
2. ${isApproachSunset ? `日落只剩${Math.round(remainSunset)}分钟！优先 Signal Hill 或 Camps Bay 看夕阳` : ''}
3. ${isAfterSunset ? '日落已过！只推荐室内（V&A、餐厅），不推荐自然景点' : ''}
4. 仔细考虑人数「${peopleCount}」：
   - 人多（5人以上）→ 推荐空间宽敞、适合团队的地方，提到为什么适合多人
   - 2人 → 可以推荐更浪漫或私密的体验
5. 仔细读大家说的「${extra || '无'}」，给有针对性的回复
6. 语气口语化，像朋友聊天

返回 JSON：
{
  "intro": "一句话，直接回应人数+时间+大家说的话，口语化有温度",
  "suggestions": [
    {
      "name": "景点名称",
      "icon": "emoji",
      "reason": "为什么现在去好，直接提到人数（比如'你们${peopleCount}去这里...'），2-3句",
      "schedule": "XX:XX 出发 → XX:XX 到达 → 游览约X → XX:XX 返回",
      "tip": "一个贴心提示",
      "spotId": 景点ID数字（没有填-1）,
      "web": "官网链接或null"
    }
  ]
}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Anthropic API error: ${response.status}`, detail: errText });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(200).json({ raw, parseError: true });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
