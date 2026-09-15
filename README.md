# AI for Edu

Hệ sinh thái công cụ AI cho giáo dục Việt Nam — **local-first, không cần API key, đúng format chuẩn Việt Nam**.

Ưu tiên hiện tại: **tool cho giáo viên & sinh viên sư phạm** (`edu-cli/`), chạy model local qua Ollama nên hoàn toàn miễn phí và dữ liệu không rời máy.

## Bắt đầu nhanh

```bash
ollama pull qwen3:4b-instruct   # hoặc qwen3:8b nếu máy 16GB RAM
pip install requests
python3 edu-cli/educli/main.py quiz -i edu-cli/samples/baidoc.txt -n 5 --level thcs
```

## Tài liệu

- **[Master spec](docs/ai-for-edu-spec.md)** — tầm nhìn, kiến trúc, nguyên tắc kỹ thuật đã kiểm chứng, lộ trình 4 phase
- [edu-cli](edu-cli/README.md) — hướng dẫn dùng + khuyến nghị cỡ model theo phần cứng
- [Spec KidCode](docs/kidcode-spec.md) — nền tảng STEM cho trẻ em (Phase 4)
- [Khảo sát EdTech Corner](docs/research/khao-sat-edtechcorner.md) — nghiên cứu thị trường

## Nguyên tắc cốt lõi

1. Format là của code, nội dung là của model.
2. Không tin model ở chi tiết — validate mọi thứ bằng code.
3. Tác vụ khó thì chia nhỏ pipeline trước khi đổi model to hơn.
