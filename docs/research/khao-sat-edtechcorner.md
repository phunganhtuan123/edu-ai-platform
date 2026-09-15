# Khảo sát: EdTech Corner (edtechcorner.com)

**Ngày khảo sát:** 15/09/2026 · Phục vụ project AI for Edu / KidCode

---

## 1. Tổng quan

| Hạng mục | Thông tin |
|---|---|
| Trang | https://edtechcorner.com — "EdTech Corner: Language Teaching Technology" |
| Người sáng lập | Thầy **Lê Nguyễn Như Anh**, giảng viên tiếng Anh, ĐH Sư phạm TP.HCM (liên hệ: anhlnn@hcmue.edu.vn, Facebook @meousensei) |
| Ra đời | Khoảng 3/2025, xuất phát từ nhu cầu cá nhân: AI phổ thông (ChatGPT...) "quên" hướng dẫn, output không nhất quán khi soạn đề đọc hiểu |
| Đối tượng | Giáo viên EFL/ESL (dạy tiếng Anh) là chính; một phần cho học sinh và người dùng phổ thông |
| Mô hình | **Miễn phí hoàn toàn, phi lợi nhuận**, không bắt buộc tài khoản; nhiều app yêu cầu người dùng **tự nhập API key** (Gemini) — chi phí AI đẩy về phía người dùng |
| Ghi nhận | Top 100 Giải thưởng tiên phong ứng dụng AI trong giáo dục Việt Nam 2025 |
| Ngôn ngữ site | Tiếng Anh (bối cảnh và use case Việt Nam — ví dụ đề thi THPT quốc gia) |

## 2. Danh mục sản phẩm (~16 web app, 4 nhóm)

**Soạn bài & kiểm tra (Authoring & Assessment):** Text2Activities (tạo hoạt động tương tác — vòng quay, ô chữ, quiz — xuất file HTML offline, không cần API key), Task2MTP (tạo đề kiểm tra), Text2Quiz (sinh câu hỏi từ văn bản), Text2GoogleForms (sinh Google Forms), Word2Graph (đồ thị họ từ vựng, không dùng AI).

**Luyện thi:** Text2TiengAnhTHPT và Text2TryHard — sinh đề đúng format kỳ thi tốt nghiệp THPT 2025. Đây là điểm "sát nhu cầu Việt Nam" nhất của hệ sinh thái.

**Luyện 4 kỹ năng (cho học sinh):** SpeakEasy (luyện nói nhiều chế độ: hội thoại, thi, phát âm), SkillCheck (AI chấm bài viết), TextOptimus (hỗ trợ đọc + học từ vựng).

**Ngôn ngữ học & tiện ích AI:** Text2Tree (vẽ syntax tree), PromptCook (tạo prompt template từ tài liệu mẫu), BookTranslator (dịch tài liệu dài), BookOCR, TextCare (sửa tài liệu vỡ format), Articles2Audio, PDFClear. Một số app chạy trực tiếp trên Google AI Studio (ai.studio/apps/...).

## 3. Cách vận hành & kỹ thuật

- Web app tĩnh/nhẹ, một số xuất **file HTML chạy offline** (Text2Activities) — rất hợp giáo viên vùng khó, trường thiếu mạng.
- Không backend thu phí, không quản lý người dùng, không lưu dữ liệu tập trung → chi phí vận hành gần như bằng 0; chi phí AI do **người dùng tự trả qua API key riêng** (có video hướng dẫn lấy key).
- Một phần app được build/host qua Google AI Studio — cho thấy đây là sản phẩm "một người làm", tốc độ ra tính năng nhanh, nhưng không có hạ tầng sản phẩm hoàn chỉnh (auth, billing, mobile app, cộng đồng).
- Site không có blog, không hiển thị số liệu người dùng, không có mục cộng đồng ngay trên trang; sức lan tỏa chủ yếu qua Facebook cá nhân, workshop giáo viên (CEP Vietnam...) và báo chí.

## 4. Triết lý đáng chú ý

"AI không thay thế giáo viên, mà giúp họ chuyển từ lao động thủ công thành **người thiết kế và kiểm soát chất lượng**." Giáo viên vẫn giữ quyền quyết định mục tiêu, đánh giá, thiết kế bài học. Cam kết duy trì miễn phí, ưu tiên giáo viên vùng khó khăn.

## 5. Bài học rút ra cho AI for Edu / KidCode

### Điểm mạnh của họ đáng học
1. **Đi từ một nỗi đau rất cụ thể** (soạn đề đọc hiểu đúng format thi THPT) → sản phẩm "trúng" ngay, không cần marketing. KidCode cũng nên chọn 1 pain point mở màn thật sắc (ví dụ: "con nghiện màn hình → biến giờ màn hình thành giờ chế tạo").
2. **Bám format/chuẩn địa phương** (đề thi THPT 2025) là lợi thế cạnh tranh mà các tool AI quốc tế không có. Với KidCode: bám chương trình STEM phổ thông VN, vật tư mua được ở VN, giá VN.
3. **Offline-first cho bối cảnh VN** (file HTML tải về dùng không cần mạng) — gợi ý cho KidCode: bài học/checklist nên cache offline được, vì giờ "lắp ráp" của bé không phải lúc nào cũng có mạng tốt.
4. **Tốc độ ship**: ~16 app trong hơn 1 năm bởi 1 người, nhờ dựa trên LLM + AI Studio. Chứng minh MVP giáo dục AI có thể rất tinh gọn.

### Khoảng trống họ để lại (cơ hội cho mình)
1. **Không phục vụ trẻ em trực tiếp và không có mảng STEM/robotics/maker** — hoàn toàn không giao thoa với KidCode về sản phẩm; chỉ giao thoa "AI + giáo dục VN" về định vị.
2. **Mô hình BYO API key** là rào cản lớn với người không rành công nghệ — KidCode làm ngược lại (token đóng gói trong subscription, phụ huynh không cần biết API là gì) chính là điểm bán.
3. **Không có tài khoản → không có dữ liệu học tập, không có tiến độ, không có cộng đồng** — vòng lặp giữ chân (lộ trình, huy hiệu, sân chơi) của KidCode là thứ mô hình free-tool không làm được.
4. **Không có mô hình doanh thu** → khó scale đội ngũ và chất lượng dài hạn; đây vừa là cảnh báo (thị trường giáo viên VN quen dùng miễn phí) vừa là lý do KidCode nên thu tiền từ **phụ huynh** (sẵn sàng chi cho con) chứ không phải giáo viên.

### Khả năng hợp tác
Thầy Như Anh là KOL uy tín trong cộng đồng giáo viên ứng dụng AI tại VN (workshop, giải thưởng, báo chí). Khi KidCode ra mắt mảng B2B trường học (Phase 3), đây là kiểu đối tác/advisor đáng tiếp cận, hoặc học theo kênh phân phối của họ: workshop giáo viên + cộng đồng Facebook giáo dục.

---

## Nguồn

- [EdTech Corner — trang chủ](https://edtechcorner.com/)
- [EdTech Corner — kho ứng dụng](https://edtechcorner.com/apps)
- [EdTech Corner — Contact](https://edtechcorner.com/contact)
- [Vietnam.vn — "Người thầy đứng sau hệ sinh thái AI vì giáo viên miễn phí"](https://www.vietnam.vn/en/nguoi-thay-dung-sau-he-sinh-thai-ai-vi-giao-vien-mien-phi)
- [CEP Vietnam — Online Workshop #64: Designing comics with AI to teach English](https://cepvn.com/online-workshop-64-designing-comics-with-ai-to-teach-english/)
- [Facebook Lê Nguyễn Như Anh (@meousensei)](https://www.facebook.com/meousensei/)
