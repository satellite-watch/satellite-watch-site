#!/usr/bin/env python3
# 返事を書き終えたときに、その返事が日本語かどうかを確かめる（Stop フック）。
# オーナーへの返事は日本語で書く決まり（CLAUDE.md）だが、英語で書いてしまうことが何度もあったため（2026-10-07 オーナー判断で入れた）。
# 英字が多くて日本語が少ないときは差し戻し、日本語で書き直させる。差し戻しは1回だけ（書き直しを何度も繰り返さないように）。
import json, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if data.get('stop_hook_active'):
    sys.exit(0)

path = data.get('transcript_path')
if not path:
    sys.exit(0)

texts = []  # 今回の返事（最後にオーナーが書いてから後）の文章
try:
    with open(path, encoding='utf-8') as f:
        for line in f:
            try:
                e = json.loads(line)
            except Exception:
                continue
            if e.get('isSidechain'):
                continue
            t = e.get('type')
            content = (e.get('message') or {}).get('content')
            if t == 'user':
                # 道具の結果ではなく、オーナーが書いたものなら、そこから数え直す
                if isinstance(content, str) or (isinstance(content, list) and any(c.get('type') == 'text' for c in content if isinstance(c, dict))):
                    texts = []
            elif t == 'assistant' and isinstance(content, list):
                for c in content:
                    if isinstance(c, dict) and c.get('type') == 'text' and c.get('text', '').strip():
                        texts.append(c['text'])
except Exception:
    sys.exit(0)

if not texts:
    sys.exit(0)

# 最後の文章（オーナーが読む返事）で判断する。短すぎるときは今回の文章をまとめて見る
text = texts[-1] if len(texts[-1]) >= 40 else '\n'.join(texts)
# コード・ファイル名・アドレスなど、英字になりやすい部分は数えない
text = re.sub(r'```.*?```', ' ', text, flags=re.S)
text = re.sub(r'`[^`]*`', ' ', text)
text = re.sub(r'https?://\S+', ' ', text)
ja = len(re.findall(r'[぀-ヿ㐀-鿿！-｠]', text))
en = len(re.findall(r'[A-Za-z]', text))
if ja + en < 20:
    sys.exit(0)
if ja < en * 0.5:
    print(json.dumps({
        'decision': 'block',
        'reason': '直前の返事が英語で書かれています。オーナーへの返事・報告は、いつも日本語で書く決まりです（CLAUDE.md）。同じ内容を、専門用語を避けた日本語で書き直してください。英語で書いたことへのおわびは要りません。',
    }, ensure_ascii=False))
sys.exit(0)
