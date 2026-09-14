// CyberGFAI 后端接口
// 部署到 Vercel 后，API key 通过环境变量 DEEPSEEK_API_KEY 注入，不暴露给前端
import { SYSTEM_PROMPT, GREETING, NAME } from "../persona.js";

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

// 简单的内存记忆（Vercel serverless 每次调用是独立实例，这里用轻量方案：
// 由前端把最近对话一起传过来，后端拼进上下文）
export default async function handler(req, res) {
  // 只接受 POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "只支持 POST" });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "服务器未配置 API key" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) {
      res.status(400).json({ error: "请求体格式错误" });
      return;
    }
  }

  const userMessage = (body && body.message || "").trim();
  const history = (body && body.history) || []; // 前端传来的最近对话 [{role, content}]

  if (!userMessage) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  // 构造消息：系统人设 + 历史 + 当前
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  // 历史最多带最近 20 条，控制 token
  for (const h of history.slice(-20)) {
    if (h && h.role && h.content) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: userMessage });

  try {
    const r = await fetch(API_URL, {
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
