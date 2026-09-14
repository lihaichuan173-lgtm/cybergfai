# -*- coding: utf-8 -*-
"""
导入聊天记录到 Supabase 向量库
流程：读 chat_导出.txt -> 硅基流动 embedding -> Supabase REST 存 memories 表

用法：
    python import_memories.py --limit 500      # 只导前 500 条（测试）
    python import_memories.py                  # 全量导入
"""
import requests
import sys
import time
import re

# ===== 配置 =====
SF_KEY = "sk-gjmrzlswzuxxdkdyucdtbblmmcvojoroasuizmkhhzyfrofh"                       # 硅基流动 key
SF_EMBED_URL = "https://api.siliconflow.cn/v1/embeddings"
SF_MODEL = "BAAI/bge-m3"

SUPABASE_URL = "https://agyoqcbkuzzhrwphlvig.supabase.co"
SUPABASE_KEY = "sb_secret_4QhJYZLuKM5wdPIhGoH-EQ_lFZyzqUe"  # service_role key

CHAT_FILE = r"G:\微信记录\聊天记录\笨蛋女友（不再联系）(wxid_ftx163flugxo22)\chat_导出.txt"

BATCH_SIZE = 32  # 每批 embedding 条数


def embed_batch(texts):
    """批量 embedding，返回 list[list[float]]"""
    headers = {"Authorization": f"Bearer {SF_KEY}", "Content-Type": "application/json"}
    payload = {"model": SF_MODEL, "input": texts}
    r = requests.post(SF_EMBED_URL, json=payload, headers=headers, timeout=60)
    r.raise_for_status()
    data = r.json()
    return [d["embedding"] for d in data["data"]]


def insert_rows(rows):
    """通过 Supabase REST 插入，rows = [{role, content, embedding}]"""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/memories", json=rows, headers=headers, timeout=60)
    if r.status_code not in (200, 201, 204):
        print("插入失败:", r.status_code, r.text[:300])
        return False
    return True


def parse_lines(path):
    """读 chat_导出.txt，返回 [(role, content), ...]"""
    result = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith("我:"):
                result.append(("user", line[2:].strip()))
            elif line.startswith("她:"):
                result.append(("assistant", line[2:].strip()))
    return result


def main():
    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        limit = int(sys.argv[idx + 1])

    print("读取聊天记录...")
    pairs = parse_lines(CHAT_FILE)
    print(f"共 {len(pairs)} 条")
    if limit:
        pairs = pairs[:limit]
        print(f"本次只导入前 {limit} 条")

    total = len(pairs)
    done = 0
    start = time.time()

    for i in range(0, total, BATCH_SIZE):
        batch = pairs[i:i + BATCH_SIZE]
        texts = [c for _, c in batch]
        try:
            vecs = embed_batch(texts)
            rows = []
            for (role, content), vec in zip(batch, vecs):
                rows.append({"role": role, "content": content, "embedding": vec})
            if insert_rows(rows):
                done += len(rows)
        except Exception as e:
            print(f"批次 {i} 出错: {e}")
            time.sleep(2)

        # 进度
        if (i // BATCH_SIZE) % 10 == 0:
            elapsed = time.time() - start
            speed = done / elapsed if elapsed > 0 else 0
            print(f"进度: {done}/{total} | 速度 {speed:.1f} 条/秒 | 已用 {elapsed:.0f}s")

        time.sleep(0.3)  # 避免限流

    elapsed = time.time() - start
    print(f"\n✅ 导入完成，共 {done} 条，用时 {elapsed:.0f}s")


if __name__ == "__main__":
    main()
