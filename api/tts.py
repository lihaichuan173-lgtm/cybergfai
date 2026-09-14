# -*- coding: utf-8 -*-
"""
TTS 接口：用 edge-tts 生成语音，返回 mp3
部署到 Vercel 作为 Python serverless 函数
"""
from http.server import BaseHTTPRequestHandler
import asyncio
import io
import json
import urllib.parse

import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"  # 晓晓，温柔女声


def run_tts(text):
    """同步包装 edge-tts，返回音频 bytes"""
    async def _go():
        communicate = edge_tts.Communicate(text, VOICE)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()
    return asyncio.run(_go())


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 解析 ?text=xxx
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        text = (qs.get("text") or [""])[0].strip()

        if not text:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "缺少 text 参数"}).encode("utf-8"))
            return

        try:
            audio = run_tts(text)
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def log_message(self, *args):
        pass
