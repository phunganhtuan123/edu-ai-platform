#!/usr/bin/env python3
"""edu thpt — sinh section đề thi tốt nghiệp THPT 2025 môn Tiếng Anh, ĐÚNG FORMAT.

Triết lý: FORMAT LÀ CỦA CODE, NỘI DUNG LÀ CỦA MODEL.
Cấu trúc đề 2025 (40 câu/50 phút, 6 dạng bài, câu lệnh chuẩn, đánh số liên tục)
nằm cứng trong template dưới đây — model local (Ollama) chỉ điền nội dung,
nên format ra luôn đúng 100% bất kể model mạnh hay yếu.

Demo v0.1: dạng bài số 1 — "Điền từ vào thông báo" (6 câu).
"""

import argparse
import json
import re
import sys
import time

import requests

DEFAULT_HOST = "http://localhost:11434"
DEFAULT_MODEL = "qwen3:4b-instruct"

# ==== FORMAT CỐ ĐỊNH CỦA ĐỀ 2025 (không cho model đụng vào) ====

EXAM_STRUCTURE = [
    ("notice", "Điền từ vào thông báo", 6),
    ("leaflet", "Điền từ vào tờ rơi/quảng cáo", 6),
    ("arrangement", "Sắp xếp hội thoại/thư/đoạn văn", 5),
    ("gap_fill", "Đọc điền khuyết thông tin", 5),
    ("reading_8", "Đọc hiểu bài 1", 8),
    ("reading_10", "Đọc hiểu bài 2", 10),
]  # tổng đúng 40 câu

CLOZE_INSTRUCTION = (
    "Read the following {doc_type} and mark the letter A, B, C, or D on your "
    "answer sheet to indicate the option that best fits each of the numbered blanks "
    "from {start} to {end}."
)

NOTICE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "passage": {
            "type": "string",
            "description": "Notice text with blanks marked exactly as (1)_____, (2)_____ ...",
        },
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "blank_number": {"type": "integer"},
                    "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
                    "correct_option": {"type": "string"},
                    "tested_point": {"type": "string"},
                },
                "required": ["blank_number", "options", "correct_option", "tested_point"],
            },
        },
    },
    "required": ["title", "passage", "items"],
}

SYSTEM_PROMPT = """You are an English test item writer for the Vietnamese national high school graduation exam (THPT 2025 format).
Task: write ONE short school/community NOTICE (announcement) of 80-110 words about the given topic, containing exactly {n} numbered blanks written EXACTLY as (1)_____, (2)_____, ... (parentheses, number, five underscores).

Rules:
- Each blank tests ONE point suitable for the exam: word form, preposition, determiner, phrasal verb, relative/reduced clause, or context vocabulary. Vary the tested points.
- For each blank give 4 options (content only, no letter prefixes). Distractors must be plausible.
- correct_option: copy EXACTLY one of the 4 options.
- tested_point: name the grammar/vocab point in Vietnamese (e.g. "giới từ", "dạng từ").
- CEFR level around B1. Do not number blanks other than (1)..({n})."""


def call_ollama(host, model, system, user, schema, temperature=0.4):
    r = requests.post(
        f"{host}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "format": schema,
            "stream": False,
            "options": {"temperature": temperature, "num_ctx": 8192},
        },
        timeout=1800,
    )
    r.raise_for_status()
    d = r.json()
    return d["message"]["content"], d


def validate_notice(data, n, start_num):
    """Mọi ràng buộc format kiểm bằng code — không tin model."""
    problems = []
    passage = data.get("passage", "")
    for k in range(1, n + 1):
        found = len(re.findall(rf"\({k}\)_+", passage))
        if found != 1:
            problems.append(f"Blank ({k}) xuất hiện {found} lần trong đoạn văn (phải đúng 1)")
    extra = set(int(m) for m in re.findall(r"\((\d+)\)_+", passage)) - set(range(1, n + 1))
    if extra:
        problems.append(f"Đoạn văn có blank thừa: {sorted(extra)}")

    items = data.get("items", [])
    if len(items) != n:
        problems.append(f"Số item = {len(items)}, cần {n}")
    for it in items:
        opts = [o.strip() for o in it.get("options", [])]
        it["options"] = opts
        correct = it.get("correct_option", "").strip()
        idx = next((j for j, o in enumerate(opts) if o.lower() == correct.lower()), None)
        if idx is None:
            problems.append(f"Blank ({it.get('blank_number')}): correct_option không khớp options")
            idx = 0
        it["answer_index"] = idx
        if len(set(o.lower() for o in opts)) != 4:
            problems.append(f"Blank ({it.get('blank_number')}): options trùng nhau")
    items.sort(key=lambda x: x.get("blank_number", 0))
    return problems


def renumber(passage, items, start_num):
    """Đánh số liên tục theo vị trí section trong đề 40 câu (code làm, model không biết)."""
    mapping = {it["blank_number"]: start_num + i for i, it in enumerate(items)}
    for old, new in sorted(mapping.items(), reverse=True):
        passage = re.sub(rf"\({old}\)(_+)", f"({new})" + r"\1", passage)
    for it in items:
        it["exam_number"] = mapping[it["blank_number"]]
    return passage, items


def render_exam_markdown(data, items, start, end):
    """Render đúng layout đề thi thật: câu lệnh chuẩn → khung thông báo → options."""
    letters = "ABCD"
    out = []
    out.append(CLOZE_INSTRUCTION.format(doc_type="notice", start=start, end=end))
    out.append("")
    out.append("> **" + data["title"].upper() + "**")
    for line in data["passage"].split("\n"):
        out.append("> " + line if line.strip() else ">")
    out.append("")
    for it in items:
        opts = "\t".join(f"**{letters[j]}.** {o}" for j, o in enumerate(it["options"]))
        out.append(f"**Question {it['exam_number']}:** {opts}")
        out.append("")
    out.append("---")
    out.append("**ĐÁP ÁN (bản giáo viên):** " + " · ".join(
        f"{it['exam_number']}-{letters[it['answer_index']]} ({it['tested_point']})" for it in items
    ))
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser(prog="edu thpt", description="Sinh section đề THPT 2025 đúng format (local, không API key)")
    p.add_argument("--section", default="notice", choices=["notice"], help="Dạng bài (demo: notice)")
    p.add_argument("--topic", default="school library new opening hours", help="Chủ đề thông báo")
    p.add_argument("--start", type=int, default=1, help="Số câu bắt đầu (đánh số liên tục trong đề 40 câu)")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--host", default=DEFAULT_HOST)
    p.add_argument("-o", "--output")
    args = p.parse_args()

    n = dict((k, c) for k, _, c in EXAM_STRUCTURE)[args.section]
    system = SYSTEM_PROMPT.format(n=n)
    user = f"Topic of the notice: {args.topic}"

    print(f"⏳ Sinh section '{args.section}' ({n} câu) bằng {args.model}...", file=sys.stderr)
    t0 = time.time()
    content, meta = call_ollama(args.host, args.model, system, user, NOTICE_SCHEMA)
    data = json.loads(content)
    problems = validate_notice(data, n, args.start)
    passage, items = renumber(data["passage"], data["items"], args.start)
    data["passage"] = passage

    dt = time.time() - t0
    print(f"✅ Xong sau {dt:.0f}s", file=sys.stderr)
    if problems:
        print("⚠️  Validate:", *problems, sep="\n  - ", file=sys.stderr)

    md = render_exam_markdown(data, items, args.start, args.start + n - 1)
    if args.output:
        open(args.output, "w", encoding="utf-8").write(md)
        print(f"📄 Đã ghi {args.output}", file=sys.stderr)
    else:
        print(md)


if __name__ == "__main__":
    main()
