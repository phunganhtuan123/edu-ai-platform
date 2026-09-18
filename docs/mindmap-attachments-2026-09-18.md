# Đính kèm Word/Excel vào nhánh sơ đồ tư duy

## Phạm vi và thiết kế

Cho phép người có quyền sửa sơ đồ tải lên, liệt kê, tải xuống và gỡ tệp
`.doc`, `.docx`, `.xls`, `.xlsx` trên từng nút. Giao diện tiếng Việt nằm trong
tab Thuộc tính; số tệp hiện cạnh nhánh. Không đọc nội dung Office bằng AI,
không thêm trình xem Office, không triển khai trong vòng này.

Tệp tối đa 10 MiB; tổng dữ liệu tệp tối đa 50 MiB/sơ đồ. Lưu bytes trong bảng
riêng của cơ sở dữ liệu hiện có, metadata tách khỏi JSON cây. Cách này tránh
yêu cầu dịch vụ lưu trữ hoặc cấu hình volume mới. Không nhúng base64 vào cây
vì sẽ làm nặng lịch sử hoàn tác, danh sách kết quả và mỗi lần lưu sơ đồ.

Node ID hợp lệ phải được giữ nguyên khi lưu/di chuyển. ID thiếu, trùng hoặc
không hợp lệ được chuẩn hoá mà không chiếm ID hợp lệ của nút khác. Tệp thuộc
artifact và node ID, quyền owner/admin giống lưu sơ đồ. Không có URL công khai.

## Hợp đồng API

Tiền tố `/api/artifacts/:id/mindmap/attachments`, tất cả cần JWT.

| Thao tác | Đầu vào | Kết quả |
| --- | --- | --- |
| GET tiền tố | — | `{attachments: Attachment[]}` |
| POST tiền tố | multipart `file`, `node_id` | 201 `{attachment: Attachment}` |
| GET `/:attachmentId` | — | Bytes, Content-Disposition attachment |
| DELETE `/:attachmentId` | — | 200 `{ok: true}` |

`Attachment` gồm `id: number`, `node_id: string`, `name: string`,
`size: number`, `content_type: string`, `created_at: string`.
Metadata không chứa bytes. GET list trả cả tệp của nhánh tạm xoá; frontend
hiển thị theo cây hiện tại. Upload yêu cầu nút tồn tại trong cây đã lưu.
Download/delete chỉ cần quyền trên artifact và tệp thuộc artifact đó, nên
tệp của nhánh đã xoá vẫn có thể tải về hoặc gỡ trong mục riêng.

Frontend lưu cây trước upload khi cây còn thay đổi, báo rõ
thao tác lưu, không upload nếu lưu thất bại. Khoá thao tác sửa cây trong lúc
lưu/tải lên. Download dùng JWT rồi blob URL có thu hồi. Gỡ tệp yêu cầu xác nhận
và không thuộc undo. Khi lưu cây bỏ nhánh, giữ tệp để undo khôi phục đúng;
các tệp này vẫn tính quota. Xoá dự án/người dùng phải dọn dữ liệu tệp liên quan.

## Phân công và kiểm chứng

- BUILD: GPT-5.6 Sol high, chỉ `edutech-ai/backend`. Model, migration đăng ký
  trong code, REST handlers, validation, stable IDs, cleanup và tests SQLite
  cô lập. Không chạy migration trên cơ sở dữ liệu đang phục vụ.
- DESIGN: Claude Opus 5 high, chỉ `edutech-ai/frontend`. Toàn bộ UI/component,
  multipart/binary API helper, state/loading/error/retry, chống stale request,
  khóa tương tác, responsive/accessibility và kiểm chứng frontend.
- Root: GPT-6 Astra medium, hợp đồng, đọc diff, kiểm tra tích hợp, ghi bằng
  chứng và accept qua team MCP. Không sửa tệp đã giao con.

Các điểm nghiệm thu: upload/list/download/delete; đúng quyền owner/admin;
từ chối người khác, sai artifact/node/ID, sai định dạng và vượt quota; giữ
liên kết qua save/reorder/undo; save thất bại không upload; download bytes
đúng; tên tệp an toàn; không binary trong JSON; build/typecheck không lỗi.

Kiểm chứng dự kiến: `go test ./...`, tests tập trung handler/pipeline,
TypeScript/build frontend, `git diff --check`, đọc diff đối chiếu API/UI.
Chưa được coi là đã chạy cho đến khi có kết quả cuối bên dưới.

Giữ nguyên thay đổi có trước tại `edutech-ai/docker-compose.override.yml` và
`docs/.feature-acceptance-2026-09-18.md.swp`. Không commit/push, deploy,
restart service, thay account/config hoặc ghi dữ liệu production.

## Bằng chứng vòng 2

Hai nhánh đã được root duyệt qua team MCP; chờ người điều hành nghiệm thu.

Root chạy lại trên source cuối: `/usr/local/go/bin/go test ./... -count=1`
trong backend (exit 0); `node --test lib/mindmapAttachments.test.mjs`
trong frontend (9/9); `tsc --noEmit --incremental false` (exit 0);
`git diff --check` (exit 0). Đọc mã và test xác nhận list/download/delete
giữ quyền truy cập tệp của nhánh đã xoá; chỉ upload đòi node trong cây đã lưu.

Bằng chứng nhánh BUILD: Go race tests cho handlers/pipelines và go vet đạt;
PostgreSQL lock SQL được kiểm tra dry-run. Bằng chứng DESIGN đã được duyệt
ở lượt trước: Next build trong frontend/.verification-build đạt, hash source
app/components/lib trùng bản kiểm tra và bản sao trong scope đã được dọn.
Root không chạy lại Next build trong lượt tiếp tục này.

Chưa chạy E2E trình duyệt/backend thật, concurrency PostgreSQL thật, migration
production hoặc triển khai. Mỗi lần chọn một tệp, chưa có kéo-thả hay phần
trăm tiến độ. Tệp tối đa 10 MiB, tổng tối đa 50 MiB kể cả tệp nhánh đã xoá.

DESIGN đã báo tạo nhầm bản build ngoài scope ở
`/tmp/claude-1000/-var-web-edu-ai-platform/5065a1d0-6fb6-490d-90dc-048180f3a176/scratchpad/fe`.
Không thao tác tiếp hoặc dọn đường dẫn đó; cần operator xử lý ngoài scope.
Không commit/push, restart, deploy hoặc thay đổi cấu hình trong vòng này.
