# EduTech AI — Web app AI cho giáo viên (MVP)

Web app với các tính năng như EdTech Corner nhưng UI tiếng Việt dễ dùng hơn, chạy AI trên **server Ollama riêng** (không cần API key). Spec đầy đủ: [`../docs/edutech-ai-spec.md`](../docs/edutech-ai-spec.md).

**Tính năng MVP (môn Tiếng Anh, cấp THCS + THPT):** sinh trắc nghiệm từ văn bản · sinh đề đúng format thi (dạng thông báo/tờ rơi theo cấu trúc THPT 2025) · chấm bài viết có rubric · tạo quiz game HTML chạy offline. Tài khoản đăng ký phải được **admin duyệt**; admin có trang quản lý user (duyệt/khóa/xóa).

## Chạy bằng Docker (khuyến nghị)

```bash
cp .env.example .env   # sửa JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, OLLAMA_URL
docker compose up -d --build
# Frontend: http://localhost:3000 · Backend API: http://localhost:8080
```

Đăng nhập lần đầu bằng `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong `.env` (tài khoản admin được tạo tự động).

## Chạy dev không Docker

```bash
# 1. Postgres (docker cũng được): postgres://edutech:edutech@localhost:5432/edutech
# 2. Backend
cd backend && go run ./cmd/server        # đọc env, mặc định :8080
# 3. Frontend
cd frontend && npm install && npm run dev # :3000, NEXT_PUBLIC_API_URL=http://localhost:8080
```

## Kiến trúc tóm tắt

- `backend/` — Go (Gin + GORM + Postgres). Job AI chạy **nền** qua worker pool (mặc định 2 job đồng thời để không nghẽn server Ollama), frontend polling tiến trình. Mọi output AI đi qua validator bằng code: JSON Schema, đối chiếu đáp án theo nội dung, xáo trộn lựa chọn, cảnh báo cho giáo viên duyệt.
- `frontend/` — Next.js 14 (App Router + Tailwind), UI tiếng Việt. Môn/cấp học render từ `GET /api/meta/catalog` — môn khác & cấp Mầm non/Tiểu học hiện "Sắp có" (disable), bật dần không cần sửa frontend.
- Chọn model theo từng lần sinh, danh sách lấy trực tiếp từ server Ollama (`/api/tags`).
