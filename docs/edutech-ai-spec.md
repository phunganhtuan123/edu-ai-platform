# EduTech AI — Spec bản MVP (Web App)

**Phiên bản:** 1.0 · **Ngày:** 15/09/2026 · **Vị trí:** `ai-for-edu/edutech-ai/`
**Mục tiêu:** Web app cho giáo viên với các tính năng như EdTech Corner nhưng UI dễ dùng hơn, chạy AI trên **server Ollama riêng của anh** (không API key), có tài khoản + admin quản trị.

---

## 1. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Tên folder | `edutech-ai` (trong repo `ai-for-edu`, cạnh `edu-cli`) |
| Backend | **Go (Gin)** + GORM |
| Frontend | **Next.js** (App Router, TypeScript, Tailwind) — UI **tiếng Việt** |
| Database | **PostgreSQL** |
| AI | **Ollama trên server của anh** (URL cấu hình qua env), chọn model từ danh sách `/api/tags` |
| Tác vụ AI | **Job nền** + polling tiến trình (sinh đề local mất 1–5 phút) |
| Đăng ký | Tự đăng ký nhưng **admin duyệt mới được dùng** |
| Admin | 1 tài khoản admin cố định (seed từ env), có trang quản lý user: duyệt / tắt / xóa |
| Môn học MVP | **Tiếng Anh** (các môn khác hiện nhưng disable) |
| Cấp học MVP | **THCS + THPT** bật; Mầm non + Tiểu học hiện nhưng disable |

## 2. Tính năng MVP (4 module, đều thuộc môn Tiếng Anh)

1. **Sinh trắc nghiệm từ văn bản (Quiz)** — dán văn bản tiếng Anh → chọn số câu, cấp học → AI sinh trắc nghiệm 4 lựa chọn kèm đáp án + giải thích + mức độ (nhận biết/thông hiểu/vận dụng) → giáo viên sửa trực tiếp → xuất Markdown/JSON (docx phase sau).
2. **Sinh đề đúng format thi (Exam)** — THPT: theo cấu trúc đề 2025 (MVP: dạng "Điền từ vào thông báo" 6 câu + "Tờ rơi" 6 câu; các dạng khác hiện nút disable "sắp có"); THCS: đề trắc nghiệm tổng hợp theo chủ đề/unit. Format do code template quyết định, model chỉ điền nội dung (nguyên tắc đã kiểm chứng ở edu-cli).
3. **Chấm bài viết (Writing)** — dán bài viết tiếng Anh của học sinh + đề bài → AI chấm theo rubric (task response, vocabulary, grammar, coherence — thang điểm phù hợp cấp học) → nhận xét tiếng Việt + lỗi cụ thể kèm sửa.
4. **Tạo hoạt động tương tác (Activity)** — từ bộ câu hỏi đã sinh (hoặc nhập tay) → xuất **file HTML tự chứa** chạy offline: quiz game có tính điểm. (MVP: 1 template quiz game; ô chữ/vòng quay phase sau.)

Chống lỗi model (áp dụng mọi module — kế thừa edu-cli): JSON Schema qua Ollama structured output; model trả nội dung đáp án đúng, code đối chiếu ra chỉ số; xáo trộn vị trí lựa chọn bằng code; validator cảnh báo trong UI để giáo viên duyệt.

## 3. Vai trò & luồng người dùng

- **Khách:** chỉ thấy trang đăng nhập/đăng ký.
- **Giáo viên (user):** đăng ký → trạng thái `pending` (màn hình "chờ duyệt") → admin duyệt → `active`: tạo Project → trong project chọn môn (Tiếng Anh) + cấp học (THCS/THPT) → dùng 4 module → mọi kết quả lưu vào project, xem lại được.
- **Admin (anh):** đăng nhập bằng tài khoản seed → ngoài mọi quyền user còn có trang **Quản trị**: danh sách user (lọc theo trạng thái), duyệt (`pending→active`), tắt (`disabled` — đăng nhập bị chặn), xóa hẳn; xem số job/tháng của từng user.

Trạng thái user: `pending` → `active` ⇄ `disabled` → (xóa). Admin không thể tự tắt/xóa chính mình.

## 4. Kiến trúc & cấu trúc thư mục

```
edutech-ai/
├── docker-compose.yml        # postgres + backend + frontend
├── .env.example
├── backend/                  # Go + Gin
│   ├── cmd/server/main.go
│   └── internal/
│       ├── config/           # env: DB_URL, JWT_SECRET, OLLAMA_URL, ADMIN_EMAIL/PASSWORD
│       ├── models/           # GORM: User, Project, Job, Artifact
│       ├── auth/             # JWT, middleware, bcrypt
│       ├── handlers/         # REST: auth, users(admin), projects, jobs, ai
│       ├── ollama/           # client: ListModels, ChatStructured (format=JSON schema)
│       ├── pipelines/        # quiz.go, exam.go, writing.go, activity.go + validators
│       └── worker/           # job queue trong process (goroutine pool, cap đồng thời)
└── frontend/                 # Next.js App Router + Tailwind, UI tiếng Việt
    └── app/
        ├── (auth)/login, register, cho-duyet
        ├── (main)/projects, projects/[id]  # 4 tab module + lịch sử kết quả
        └── (main)/admin/users
```

**Luồng job nền:** POST tạo job (`queued`) → worker goroutine nhặt → gọi Ollama server (structured output) → validate/normalize → lưu `Artifact` → job `done`/`failed` (kèm lỗi). Frontend polling `GET /jobs/:id` mỗi 2s, hiện trạng thái + thời gian chạy. Giới hạn: tối đa N job Ollama chạy đồng thời (env `MAX_CONCURRENT_JOBS`, mặc định 2) để không nghẽn server model — job thừa xếp hàng.

## 5. Data model

- **users**: id, email (unique), password_hash, name, role (`admin`/`teacher`), status (`pending`/`active`/`disabled`), created_at
- **projects**: id, user_id, name, subject (`english`; enum mở rộng sau), grade_level (`thcs`/`thpt`; enum có `mamnon`/`tieuhoc` nhưng bị chặn ở API), created_at
- **jobs**: id, user_id, project_id, type (`quiz`/`exam`/`writing`/`activity`), status (`queued`/`running`/`done`/`failed`), model (tên model Ollama), input JSONB, error, created_at, started_at, finished_at
- **artifacts**: id, job_id, project_id, type, title, content JSONB (quiz items / exam section / feedback / html), created_at

## 6. API chính (REST, prefix `/api`)

- Auth: `POST /auth/register`, `POST /auth/login` → JWT; `GET /me`
- Admin: `GET /admin/users?status=`, `PATCH /admin/users/:id` (approve/disable/enable), `DELETE /admin/users/:id`
- Projects: `GET|POST /projects`, `GET|DELETE /projects/:id`; `GET /projects/:id/artifacts`
- AI: `GET /ai/models` (proxy Ollama `/api/tags`); `POST /projects/:id/jobs` {type, model, input} → job id; `GET /jobs/:id` (kèm artifact khi done)
- Meta: `GET /meta/catalog` — danh sách môn/cấp học kèm cờ `enabled` (frontend render nút disable từ đây, không hardcode)

## 7. Cấu hình (.env)

`DATABASE_URL` · `JWT_SECRET` · `OLLAMA_URL` (server Ollama của anh, vd `http://192.168.1.10:11434`) · `ADMIN_EMAIL` + `ADMIN_PASSWORD` (seed admin lần chạy đầu) · `MAX_CONCURRENT_JOBS` · `DEFAULT_MODEL` (vd `qwen3:8b`)

## 8. Ngoài phạm vi MVP (ghi rõ để không lan man)

Xuất docx đúng mẫu đề in · các dạng bài THPT còn lại (sắp xếp, đọc hiểu...) · môn khác ngoài Tiếng Anh · cấp Mầm non/Tiểu học · ngân hàng đề chia sẻ giữa giáo viên · thanh toán/gói cước · email verification (duyệt tay bởi admin thay thế) · HTTPS/reverse proxy (anh tự cấu hình nginx trên server).

## 9. Tiêu chí nghiệm thu MVP

Đăng ký → chờ duyệt → admin duyệt → đăng nhập OK · tạo project Tiếng Anh THCS/THPT (Mầm non/Tiểu học bị disable đúng) · cả 4 module chạy end-to-end với Ollama server thật, job nền có tiến trình, kết quả lưu và xem lại được · admin tắt user thì user đó bị chặn đăng nhập ngay · `docker compose up` chạy được toàn bộ từ máy sạch.
