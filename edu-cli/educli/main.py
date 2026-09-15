#!/usr/bin/env python3
"""edu — CLI sinh học liệu bằng AI chạy local (Ollama) cho giáo viên/sinh viên.

Prototype v0.1: lệnh `quiz` — sinh câu hỏi trắc nghiệm từ văn bản.
Chạy hoàn toàn offline với Ollama, không cần API key.

Dùng:
    edu quiz -i baidoc.txt -n 5 --level thpt
    edu quiz -i baidoc.txt --model qwen3:4b-instruct --host http://192.168.1.10:11434
"""

import argparse
import json
import random
import sys
import time

import requests

DEFAULT_HOST = "http://localhost:11434"
DEFAULT_MODEL = "qwen3:4b-instruct"

# JSON Schema — ép model trả đúng cấu trúc, validate được bằng code
QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "correct_option": {"type": "string"},
                    "explanation": {"type": "string"},
                    "bloom_level": {
                        "type": "string",
                        "enum": ["nhận biết", "thông hiểu", "vận dụng"],
                    },
                },
                "required": ["question", "options", "correct_option", "explanation", "bloom_level"],
            },
        }
    },
    "required": ["questions"],
}

SYSTEM_PROMPT = """Bạn là trợ lý soạn đề cho giáo viên Việt Nam.
Nhiệm vụ: đọc văn bản được cung cấp và soạn câu hỏi trắc nghiệm 4 lựa chọn (A/B/C/D) CHỈ dựa trên nội dung văn bản đó.

Quy tắc bắt buộc:
- Viết bằng tiếng Việt chuẩn mực, phù hợp học sinh cấp {level}.
- Mỗi câu đúng 4 lựa chọn; chỉ 1 đáp án đúng; các phương án nhiễu phải hợp lý, không ngớ ngẩn.
- options: chỉ ghi NỘI DUNG lựa chọn, KHÔNG thêm tiền tố "A.", "B.", "C.", "D.".
- correct_option: chép lại NGUYÊN VĂN nội dung của lựa chọn đúng (phải trùng khớp với một phần tử trong options).
- Không hỏi kiến thức ngoài văn bản.
- Phân bổ mức độ theo thang Bloom rút gọn: nhận biết / thông hiểu / vận dụng.
- explanation: giải thích ngắn gọn vì sao đáp án đúng, trích ý từ văn bản; không nhắc chữ cái A/B/C/D."""

USER_PROMPT = """Văn bản:
\"\"\"
{text}
\"\"\"

Hãy soạn đúng {n} câu hỏi trắc nghiệm theo quy tắc."""

LEVELS = {"th": "tiểu học", "thcs": "THCS", "thpt": "THPT", "dh": "đại học"}


def call_ollama(host, model, system, user, schema, temperature=0.3):
    """Gọi Ollama /api/chat với structured output (JSON schema)."""
    resp = requests.post(
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
    resp.raise_for_status()
    data = resp.json()
    return data["message"]["content"], data


import re


def _clean_option(s):
    """Bỏ tiền tố 'A. ', 'B) '... nếu model lỡ thêm."""
    return re.sub(r"^\s*[A-Da-d][\.\)]\s*", "", s).strip()


def normalize_and_validate(quiz):
    """Chuẩn hóa output + kiểm tra bằng code những gì không nên tin model.

    Điểm mấu chốt: model trả correct_option dạng NỘI DUNG, code tự đối chiếu
    ra answer_index → loại bỏ hẳn lớp lỗi 'chỉ số đáp án mâu thuẫn giải thích'
    thường gặp ở model nhỏ.
    """
    problems = []
    for i, q in enumerate(quiz.get("questions", []), 1):
        q["options"] = [_clean_option(o) for o in q.get("options", [])]
        opts = q["options"]
        if len(opts) != 4:
            problems.append(f"Câu {i}: không đủ 4 lựa chọn")
        if len(set(o.lower() for o in opts)) != len(opts):
            problems.append(f"Câu {i}: lựa chọn bị trùng nhau")
        if not q.get("question", "").strip():
            problems.append(f"Câu {i}: thiếu nội dung câu hỏi")

        correct = _clean_option(q.get("correct_option", ""))
        # Đối chiếu chính xác trước, sau đó nới lỏng (chứa nhau) nếu cần
        idx = next((j for j, o in enumerate(opts) if o.lower() == correct.lower()), None)
        if idx is None:
            idx = next(
                (j for j, o in enumerate(opts)
                 if correct.lower() in o.lower() or o.lower() in correct.lower()),
                None,
            )
        if idx is None:
            problems.append(f"Câu {i}: correct_option không khớp lựa chọn nào — cần người duyệt")
            idx = 0

        # Xáo trộn vị trí lựa chọn bằng code — chống thiên vị vị trí của model
        # (model nhỏ hay đặt đáp án đúng vào cùng một vị trí)
        order = list(range(len(opts)))
        random.shuffle(order)
        q["options"] = [opts[j] for j in order]
        q["answer_index"] = order.index(idx)
    return problems


def render_markdown(quiz, with_answers=True):
    letters = "ABCD"
    out = ["# Đề trắc nghiệm\n"]
    for i, q in enumerate(quiz["questions"], 1):
        out.append(f"**Câu {i}.** ({q['bloom_level']}) {q['question']}\n")
        for j, opt in enumerate(q["options"]):
            out.append(f"- {letters[j]}. {opt}")
        out.append("")
    if with_answers:
        out.append("\n---\n\n## Đáp án & giải thích\n")
        for i, q in enumerate(quiz["questions"], 1):
            out.append(f"**Câu {i}: {letters[q['answer_index']]}** — {q['explanation']}\n")
    return "\n".join(out)


def cmd_quiz(args):
    text = open(args.input, encoding="utf-8").read() if args.input else sys.stdin.read()
    if not text.strip():
        sys.exit("Lỗi: văn bản đầu vào rỗng.")
    level = LEVELS.get(args.level, args.level)
    system = SYSTEM_PROMPT.format(level=level)
    user = USER_PROMPT.format(text=text.strip(), n=args.num)

    print(f"⏳ Đang sinh {args.num} câu hỏi bằng model {args.model} (local)...", file=sys.stderr)
    t0 = time.time()
    content, meta = call_ollama(args.host, args.model, system, user, QUIZ_SCHEMA)
    dt = time.time() - t0

    quiz = json.loads(content)  # schema-enforced nên luôn là JSON hợp lệ
    problems = normalize_and_validate(quiz)

    eval_tok = meta.get("eval_count", 0)
    print(
        f"✅ Xong sau {dt:.0f}s ({eval_tok} token, ~{eval_tok/dt:.1f} tok/s)",
        file=sys.stderr,
    )
    if problems:
        print("⚠️  Cảnh báo validate:", *problems, sep="\n  - ", file=sys.stderr)

    if args.json:
        print(json.dumps(quiz, ensure_ascii=False, indent=2))
    else:
        md = render_markdown(quiz, with_answers=not args.no_answers)
        if args.output:
            open(args.output, "w", encoding="utf-8").write(md)
            print(f"📄 Đã ghi ra {args.output}", file=sys.stderr)
        else:
            print(md)


def main():
    p = argparse.ArgumentParser(prog="edu", description="Trợ lý AI local cho giáo viên (chạy bằng Ollama, không cần API key)")
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("quiz", help="Sinh câu hỏi trắc nghiệm từ văn bản")
    q.add_argument("-i", "--input", help="File văn bản đầu vào (mặc định: stdin)")
    q.add_argument("-n", "--num", type=int, default=5, help="Số câu hỏi (mặc định 5)")
    q.add_argument("--level", default="thpt", help="Cấp học: th|thcs|thpt|dh (mặc định thpt)")
    q.add_argument("--model", default=DEFAULT_MODEL, help=f"Model Ollama (mặc định {DEFAULT_MODEL})")
    q.add_argument("--host", default=DEFAULT_HOST, help="Ollama host — trỏ sang server GPU của trường nếu có")
    q.add_argument("-o", "--output", help="Ghi kết quả markdown ra file")
    q.add_argument("--json", action="store_true", help="In JSON thô thay vì markdown")
    q.add_argument("--no-answers", action="store_true", help="Không kèm đáp án (bản phát cho học sinh)")
    q.set_defaults(func=cmd_quiz)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
