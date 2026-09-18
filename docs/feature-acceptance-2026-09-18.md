# Giáo án, sơ đồ tư duy và quản trị sử dụng AI

## Phạm vi và trách nhiệm

- Coordinator A: quyết định hợp đồng, đọc diff, đối chiếu yêu cầu và nghiệm thu qua team MCP.
- BUILD A1 (GPT-5.6 Sol high): `edutech-ai/backend`.
- DESIGN A2 (Claude Opus 5 high): toàn bộ `edutech-ai/frontend`.
- Không triển khai, chạy migration dữ liệu thật hoặc thay đổi cấu hình dịch vụ. Giữ thay đổi có sẵn tại `edutech-ai/docker-compose.override.yml`.
- Kiểm thử thực thi cần người điều hành cho phép theo chỉ dẫn phiên; rà soát nguồn được tiến hành trước.

## Thiết kế tích hợp

Dùng job/artifact và worker hiện có. Job `lesson_plan` nhận chủ đề, nhóm tuổi/lớp, thời lượng, mục tiêu, học liệu và ghi chú. Backend lấy môn/cấp từ project đã kiểm tra quyền sở hữu. Giáo án trả mục tiêu, học liệu, hoạt động của giáo viên/học sinh, đánh giá và điều chỉnh theo năng lực; giáo viên duyệt trước khi dùng.

Landing page công khai tại `/`; dashboard tại `/projects`. Giáo án có trên mầm non, tiểu học, THCS, THPT. Các module tiếng Anh giữ giới hạn môn/cấp phù hợp. Mindmap giữ cây `id/text/tag/children` để các thao tác mới vẫn lưu qua API sẵn có.

Token lấy từ số liệu trả về của Ollama, gom theo job và người dùng. Job cũ chưa đo không được hiển thị như số 0 đã đo. Lịch sử sử dụng AI là API chỉ dành cho admin, có phân trang và lọc người dùng. Không tạo dữ liệu thanh toán giả.

## Hợp đồng

- `POST /api/projects/:id/jobs`: `type=lesson_plan`; input `{topic, age_group?, class_name?, duration_minutes, objectives?, materials?, notes?}`. Các mục tiêu/học liệu đầu vào là chuỗi nhiều dòng.
- Giáo án: `{title, topic, grade_level, subject, class_name, age_group, duration_minutes, objectives:string[], materials:string[], activities:[{title,duration_minutes,teacher_actions,student_actions,resources}], assessment:string[], differentiation:string[], warnings:string[]}`. Ba trường nội dung hoạt động là chuỗi.
- `GET /api/admin/usage?user_id=&page=&page_size=`: `{items,total,page,page_size,summary}`. Mỗi item có job/user/project/type/status/model, token vào/ra/tổng, `usage_recorded`, thời gian. Summary có token vào/ra/tổng, `job_count`, `recorded_job_count`.
- Admin users thêm `prompt_tokens`, `completion_tokens`, `total_tokens`, `usage_recorded_jobs`.

## Tiêu chí rà soát

- [ ] Mầm non và cả ba cấp phổ thông tạo được giáo án; backend không tin cấp/môn do client tự khai.
- [ ] Đầu vào được giới hạn và nội dung AI được chuẩn hóa; nội dung xuất HTML được escape.
- [ ] Có kết quả giáo án, cảnh báo duyệt nội dung, in/xuất và trình chiếu.
- [ ] Mindmap tìm/chọn nút, sửa nhãn, di chuyển nhánh vẫn giữ giới hạn độ sâu/số nút và undo/redo.
- [ ] Thay đổi sơ đồ lưu qua API hiện có, tải lại không mất nội dung.
- [ ] Token được cộng qua nhiều lần gọi trong job; các job đồng thời không lẫn số liệu; lỗi ở bước sau không làm mất số liệu bước trước.
- [ ] API thống kê chỉ admin; phân trang có giới hạn, query dùng tham số, không trả nội dung prompt riêng tư.
- [ ] Landing page không bị auth redirect; đăng nhập và điều hướng đến dashboard đúng route.
- [ ] Trạng thái tải/lỗi/rỗng, responsive và thao tác bàn phím được rà soát.
- [ ] Báo riêng kiểm chứng đã chạy, chưa chạy và trở ngại; không tuyên bố đã triển khai.

## Điểm đang chờ xác nhận

- “MindX” tạm hiểu là trình sơ đồ kiểu XMind, chưa có xác nhận từ người điều hành.
- “Lịch sử giao dịch” chưa rõ là sử dụng AI hay thanh toán. Mã nguồn ứng dụng hiện tại chưa có hệ thống thanh toán; triển khai lịch sử AI trước trong phần đã rõ.
- Chưa có chấp thuận chạy Go test/TypeScript/build tại thời điểm lập tài liệu.

## Bàn giao mã nguồn

Hai nhánh đã triển khai trong phạm vi được giao. Coordinator đã đọc các thay đổi về hợp đồng giáo án, giới hạn đầu vào, phân quyền API quản trị, cộng token theo job, chuyển route dashboard, xuất HTML, trình chiếu và thao tác cây sơ đồ. Các góp ý về Space/focus khi trình chiếu, nhãn 40 ký tự, số liệu cũ khi đổi bộ lọc và bảo toàn token trước khi job lỗi đã được sửa và đối chiếu lại trong mã.

Đã chạy `git diff --check` và `git diff --cached --check`, không có lỗi. BUILD báo `gofmt -d` sạch. Đây là kiểm tra tĩnh, không thay thế kiểm thử thực thi. Các checkbox hành vi phía trên vẫn để mở cho vòng chạy ứng dụng.

Chưa chạy Go test, TypeScript, Next build, trình duyệt, gọi AI thật hoặc migration DB. Chưa cài dependency frontend, chưa khởi động dịch vụ và chưa triển khai. Tệp đổi tên dashboard đã được DESIGN đưa vào index bằng `git mv`; chưa có commit mới.

Lệnh kiểm chứng đề xuất sau khi được phép (cần dependency sẵn có hoặc cho phép cài trong dự án):

```bash
cd /var/web/edu-ai-platform/edutech-ai/backend
/usr/local/go/bin/go test ./...
```

```bash
cd /var/web/edu-ai-platform/edutech-ai/frontend
npm ci
npx tsc --noEmit
npm run build
```

Token là tổng số đã đo được, không hồi tố dữ liệu cũ. Nếu một job bị gián đoạn, các lần gọi đã có số liệu vẫn được cộng; không suy đoán token của lần gọi thiếu số liệu.

## Vòng 2 — kiểm chứng phát hành ngày 18/09/2026

Người điều hành đã cho phép deploy, tạo branch mới và push. Những hạn chế thực thi nêu ở vòng 1 phía trên là lịch sử, không phải trạng thái kiểm chứng vòng này.

- Branch phát hành: `feature/lesson-plans-mindmap-ai-usage-20260918`.
- Coordinator: GPT-6 Astra medium; BUILD: GPT-5.6 Terra high; DESIGN: Claude Opus 5 high, qua team MCP. Hai nhánh đã được coordinator nghiệm thu.
- Backend: `go test ./...`, `go build ./...`, `go mod tidy -diff` đều exit 0. Đã bổ sung dependency gián tiếp SQLite và checksum còn thiếu cho bộ test; không đổi logic ứng dụng trong vòng 2.
- Frontend: `npm ci`, `npx tsc --noEmit`, `npm run build` đều exit 0; output standalone có landing `/`, dashboard `/projects` và `/admin/usage`. Không cần sửa nguồn frontend trong vòng 2.
- Giữ thay đổi có sẵn của `docker-compose.override.yml` ngoài commit tính năng. Cấu hình Compose backend/frontend khớp hash container đang chạy trước triển khai.
- Đã tạo bản sao lưu PostgreSQL trong `.git/release-artifacts/20260918/predeploy.dump` (quyền 0600), kiểm tra danh mục bằng `pg_restore --list`; tệp không được đưa lên Git. Trước triển khai có 10 job done, 2 failed, không có job queued/running.
- Khi backend khởi động, AutoMigrate thêm bốn cột thống kê token và index `usage_recorded`. Không có down migration riêng; giữ image cũ và backup để phục hồi nếu cần.

Làm rõ contract: `duration_minutes` được frontend gửi, nhưng backend có thể nhận thiếu và dùng mặc định 30/45 phút theo cấp học.

Giới hạn còn lại: chưa chạy trình duyệt, responsive/bàn phím, E2E hoặc sinh nội dung với AI thật. Không chạy lint độc lập do chưa có cấu hình ESLint. Npm cảnh báo phiên bản Next 14.2.32 hiện tại về bảo mật; chưa nâng cấp dependency trong phạm vi phát hành này. Kết quả Docker build, push và smoke test sau triển khai được ghi trong báo cáo nghiệm thu vòng 2.
