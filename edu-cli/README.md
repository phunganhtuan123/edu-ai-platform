# edu-cli — Trợ lý AI local cho giáo viên & sinh viên sư phạm

CLI sinh học liệu bằng AI **chạy hoàn toàn trên máy local qua Ollama — không cần API key, không tốn tiền, dữ liệu không rời máy**. Prototype v0.1 gồm lệnh `quiz`: sinh câu hỏi trắc nghiệm tiếng Việt từ văn bản.

## Cài đặt

```bash
# 1. Cài Ollama (https://ollama.com/download) rồi tải model
ollama pull qwen3:4b-instruct

# 2. Chạy tool (chỉ cần Python 3.9+ và thư viện requests)
pip install requests
python3 educli/main.py quiz -i baidoc.txt -n 5 --level thcs
```

## Cách dùng

```bash
# Sinh 5 câu trắc nghiệm cấp THPT, in ra màn hình kèm đáp án
python3 educli/main.py quiz -i baidoc.txt -n 5 --level thpt

# Bản phát cho học sinh (không đáp án), ghi ra file
python3 educli/main.py quiz -i baidoc.txt --no-answers -o de-phat.md

# Xuất JSON để đưa vào hệ thống khác
python3 educli/main.py quiz -i baidoc.txt --json > quiz.json

# Cả lớp dùng chung 1 server GPU của trường (không ai cần API key)
python3 educli/main.py quiz -i baidoc.txt --host http://192.168.1.10:11434 --model qwen3:8b
```

## Chọn model Ollama cỡ nào?

Đã test thực tế với `qwen3:4b-instruct` (bản q4, ~2.5GB): tiếng Việt trôi chảy, câu hỏi bám văn bản tốt, nhưng cần các lớp chống lỗi trong code (xem dưới).

| Máy của người dùng | Model khuyến nghị | RAM cần | Ghi chú |
|---|---|---|---|
| Laptop cũ 8GB RAM, không GPU | `qwen3:4b-instruct` / `gemma3:4b` (q4) | ~4–5GB | Mức tối thiểu dùng được; sinh 4 câu hỏi mất 1–3 phút tùy CPU |
| Laptop 16GB RAM / Mac M1 trở lên | `qwen3:8b` / `gemma3:12b` (q4) | ~6–9GB | **Điểm cân bằng khuyến nghị** — chất lượng tiếng Việt và độ nhất quán tốt hơn rõ rệt, Mac chạy nhanh nhờ Metal |
| Máy có GPU 8–12GB VRAM | `qwen3:14b` (q4) | VRAM 9–10GB | Gần chất lượng cloud cho tác vụ có cấu trúc |
| Server GPU của trường (1 GPU 24GB) | `qwen3:32b` / `gemma3:27b` | VRAM ~20GB | Phục vụ cả lớp qua LAN với `--host`; rẻ hơn nhiều so với mỗi người một API key |

Dưới 4B (1–2B) không khuyến nghị cho tiếng Việt — lỗi nhất quán tăng mạnh.

## Bài học thiết kế quan trọng (rút từ test thật)

Model nhỏ **không đáng tin ở chi tiết**, nên tool này không tin model mà kiểm soát bằng code:

1. **Structured output (JSON Schema)** — ép Ollama trả đúng cấu trúc, không bao giờ vỡ JSON.
2. **Không hỏi model "đáp án là chỉ số mấy"** — test cho thấy 4B trả `answer_index` mâu thuẫn với giải thích ở 2/4 câu. Thay vào đó model chép *nguyên văn nội dung* đáp án đúng, code tự đối chiếu ra chỉ số → loại hẳn lớp lỗi này (lần chạy sau: 4/4 đúng).
3. **Xáo trộn vị trí lựa chọn bằng code** — model nhỏ thiên vị đặt đáp án đúng vào cùng một vị trí.
4. **Validate + cảnh báo** — trùng lựa chọn, thiếu lựa chọn, đáp án không khớp... in cảnh báo để giáo viên duyệt, vì giáo viên luôn là người kiểm soát chất lượng cuối.

## Kiến trúc & lộ trình

- Backend model **cắm-rút được**: mặc định Ollama localhost, `--host` trỏ đi bất kỳ đâu (server trường, endpoint OpenAI-compatible).
- Lộ trình: `edu quiz` (đã có) → `edu serve` (web UI localhost cho người không dùng terminal) → xuất `.docx` đúng ma trận đề → `edu grade` (chấm bài từ ảnh) → thư viện đề chia sẻ.
