// CyberGFAI 后端接口（带向量记忆检索）
// 流程：收到消息 -> 硅基流动 embedding -> Supabase 检索相关记忆 -> 拼入上下文 -> DeepSeek 回复
import { SYSTEM_PROMPT, GREETING, NAME } from "../persona.js";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

// 硅基流动 embedding
const SF_EMBED_URL = "https://api.siliconflow.cn/v1/embeddings";
const SF_MODEL = "BAAI/bge-m3";

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "https://agyoqcbkuzzhrwphlvig.supabase.co";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "只支持 POST" });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const sfKey = process.env.SF_KEY;
  const supabaseKey = process.env.SUPABASE_KEY;

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) {
      res.status(400).json({ error: "请求体格式错误" });
      return;
    }
  }

  const userMessage = (body && body.message || "").trim();
  const history = (body && body.history) || [];

  if (!userMessage) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  // ===== 1. 向量检索相关记忆 =====
  let memories = [];
  if (sfKey && supabaseKey) {
    try {
      // 生成查询向量
      const embedRes = await fetch(SF_EMBED_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: SF_MODEL, input: [userMessage] }),
      });
      if (embedRes.ok) {
        const embedData = await embedRes.json();
        const qvec = embedData.data?.[0]?.embedding;
        if (qvec) {
          // 检索相关记忆
          const searchRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_memories`, {
            method: "POST",
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query_embedding: qvec, match_count: 8 }),
          });
          if (searchRes.ok) {
            memories = await searchRes.json();
          }
        }
      }
    } catch (e) {
      // 检索失败不阻断对话，降级为无记忆
    }
  }

  // ===== 2. 构造消息 =====
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  // 拼入检索到的相关记忆（作为"你们过去的聊天"）
  if (memories.length > 0) {
    const memText = memories
      .map((m) => `${m.role === "user" ? "川川" : "她"}: ${m.content}`)
      .join("\n");
    messages.push({
      role: "system",
      content: `以下是你们过去的一些相关聊天记录（作为记忆参考，语气要自然衔接，不要生硬复述）：\n${memText}`,
    });
  }

  // 拼入最近对话
  for (const h of history.slice(-20)) {
    if (h && h.role && h.content) {
      messages.push({ role: h.role, content: h.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  // ===== 3. 调 DeepSeek =====
  if (!apiKey) {
    res.status(500).json({ error: "服务器未配置 API key" });
    return;
  }

  try {
    const r = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.9,
        max_tokens: 500,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      res.status(r.status).json({ error: `DeepSeek 调用失败: ${errText.slice(0, 200)}` });
      return;
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "草，老子卡壳了。";
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: `服务器错误: ${e.message}` });
  }
}
