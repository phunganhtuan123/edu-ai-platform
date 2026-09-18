import Link from "next/link";
import Logo from "@/components/Logo";
import AuthCta from "@/components/landing/AuthCta";

// Trang giới thiệu công khai. Chỉ mô tả tính năng đang có trong sản phẩm —
// không đưa số người dùng, bảng giá hay chứng nhận nào.

const FEATURES = [
  {
    icon: "📘",
    title: "Giáo án điện tử",
    body: "Nhập chủ đề và thời lượng, AI soạn khung giáo án có mục tiêu, chuẩn bị, tiến trình hoạt động của giáo viên – học sinh, đánh giá và phân hoá. Xem, in, tải HTML hoặc trình chiếu từng hoạt động.",
    levels: "Mầm non · Tiểu học · THCS · THPT",
  },
  {
    icon: "🧠",
    title: "Sơ đồ tư duy chủ đề",
    body: "AI vẽ sẵn mạng nội dung hoặc mạng hoạt động theo chủ đề; thầy cô sửa trực tiếp như XMind, sắp xếp nhánh, gắn nhãn rồi tải ảnh về in.",
    levels: "Mầm non",
  },
  {
    icon: "📝",
    title: "Trắc nghiệm từ văn bản",
    body: "Dán bài đọc, nhận bộ câu hỏi 4 lựa chọn có đáp án, giải thích và mức độ nhận thức.",
    levels: "Tiếng Anh THCS · THPT",
  },
  {
    icon: "📄",
    title: "Đề thi theo cấu trúc",
    body: "Sinh nhiều phần thi trong một lần: điền từ, sắp xếp câu, đọc hiểu. Xuất HTML làm bài trực tuyến hoặc in.",
    levels: "Tiếng Anh THCS · THPT",
  },
  {
    icon: "✍️",
    title: "Chấm bài viết theo rubric",
    body: "Chấm theo tiêu chí, chỉ ra lỗi cụ thể kèm cách sửa, nhận xét bằng tiếng Việt để thầy cô duyệt lại.",
    levels: "Tiếng Anh THCS · THPT",
  },
  {
    icon: "🎮",
    title: "Hoạt động tương tác",
    body: "Biến bộ câu hỏi thành trò chơi HTML chạy offline trên máy chiếu lớp học, không cần cài đặt.",
    levels: "Tiếng Anh THCS · THPT",
  },
];

const STEPS = [
  {
    title: "Đăng ký tài khoản",
    body: "Điền họ tên, email trường. Quản trị viên duyệt tài khoản trước khi sử dụng.",
  },
  {
    title: "Tạo dự án theo lớp",
    body: "Chọn cấp học và môn học. Mỗi dự án lưu lại toàn bộ kết quả để mở lại khi cần.",
  },
  {
    title: "Nhập yêu cầu, AI soạn nháp",
    body: "Chọn công cụ phù hợp, điền vài thông tin. AI chạy nền, trang báo tiến độ.",
  },
  {
    title: "Thầy cô duyệt và dùng",
    body: "Rà soát cảnh báo tự động, chỉnh sửa rồi in, tải về hoặc trình chiếu trên lớp.",
  },
];

const PRINCIPLES = [
  {
    title: "Giáo viên là người quyết định",
    body: "Mọi kết quả là bản nháp. Hệ thống hiển thị cảnh báo khi phát hiện điểm cần rà soát, không tự phát hành cho học sinh.",
  },
  {
    title: "Cấu trúc rõ ràng, dễ rà soát",
    body: "Giáo án, đề và đáp án được trình bày theo từng mục cố định để thầy cô xem nhanh, sửa đúng chỗ cần sửa.",
  },
  {
    title: "Đúng cấp học, đúng môn",
    body: "Công cụ hiện ra theo cấp và môn của dự án: mầm non theo nhóm tuổi, phổ thông theo lớp.",
  },
];

const COVERAGE = [
  { level: "Mầm non", tools: "Giáo án theo nhóm tuổi · Sơ đồ tư duy chủ đề" },
  { level: "Tiểu học", tools: "Giáo án theo lớp (mở theo danh mục môn đang hỗ trợ)" },
  {
    level: "THCS · THPT",
    tools: "Giáo án · Tiếng Anh: trắc nghiệm, đề thi, chấm bài viết, nhân đề theo mẫu, hoạt động tương tác",
  },
];

function LessonPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-indigo-200/60 via-white to-emerald-200/60 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Giáo án · Minh hoạ giao diện
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            35 phút
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-medium text-indigo-600">Tiếng Anh · Lớp 7</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">Unit 3 — Community service</p>
          </div>
          <div className="space-y-2">
            {[
              ["Khởi động", "5′", "bg-amber-400"],
              ["Hình thành kiến thức", "15′", "bg-indigo-500"],
              ["Luyện tập", "10′", "bg-emerald-500"],
              ["Vận dụng", "5′", "bg-rose-400"],
            ].map(([name, min, color]) => (
              <div key={name} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                <span className={`h-8 w-1.5 rounded-full ${color}`} />
                <span className="flex-1 text-sm font-medium text-slate-700">{name}</span>
                <span className="text-xs tabular-nums text-slate-500">{min}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Xem", "In", "Tải HTML", "Trình chiếu"].map((a) => (
              <span
                key={a}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Trang chủ">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-medium text-slate-600 md:flex">
            <a href="#tinh-nang" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
              Tính năng
            </a>
            <a href="#cach-dung" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
              Cách dùng
            </a>
            <a href="#cap-hoc" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">
              Cấp học
            </a>
          </nav>
          <AuthCta variant="nav" />
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/70 via-white to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr,1fr] lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                Trợ lý AI tiếng Việt cho giáo viên
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                Soạn giáo án, đề và học liệu
                <span className="block bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                  nhanh hơn — thầy cô vẫn là người duyệt.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                EduTech AI soạn bản nháp giáo án điện tử, sơ đồ tư duy, câu hỏi và đề
                kiểm tra theo đúng cấp học của lớp mình. Kết quả trình bày
                theo từng mục rõ ràng, kèm cảnh báo để thầy cô rà soát trước khi dùng.
              </p>
              <div className="mt-8">
                <AuthCta />
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Tài khoản mới cần quản trị viên duyệt trước khi sử dụng.
              </p>
            </div>
            <LessonPreview />
          </div>
        </section>

        {/* Tính năng */}
        <section id="tinh-nang" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Công cụ soạn bài trong một chỗ
              </h2>
              <p className="mt-3 text-slate-600">
                Mỗi công cụ hiện theo cấp học và môn của dự án, để thầy cô không phải
                chọn nhầm.
              </p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-2xl">
                    {f.icon}
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{f.body}</p>
                  <p className="mt-4 text-xs font-semibold text-emerald-700">{f.levels}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cách dùng */}
        <section id="cach-dung" className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Bốn bước để có bản nháp</h2>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Cấp học */}
        <section id="cap-hoc" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Theo cấp học của lớp</h2>
              <p className="mt-3 text-slate-600">
                Danh mục môn và cấp học được mở dần; mục chưa hỗ trợ hiện nhãn
                &ldquo;Sắp có&rdquo; khi tạo dự án.
              </p>
              <dl className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200">
                {COVERAGE.map((c) => (
                  <div key={c.level} className="grid gap-1 px-5 py-4 sm:grid-cols-[140px,1fr] sm:gap-4">
                    <dt className="font-semibold text-slate-900">{c.level}</dt>
                    <dd className="text-sm leading-relaxed text-slate-600">{c.tools}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Nguyên tắc làm việc</h2>
              <ul className="mt-8 space-y-4">
                {PRINCIPLES.map((p) => (
                  <li key={p.title} className="flex gap-4 rounded-2xl border border-slate-200 p-5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      ✓
                    </span>
                    <div>
                      <h3 className="font-semibold text-slate-900">{p.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Kêu gọi */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 py-12 text-center text-white sm:px-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Bắt đầu với dự án đầu tiên</h2>
            <p className="mx-auto mt-3 max-w-xl text-indigo-100">
              Đăng ký bằng email của thầy cô, chờ quản trị viên duyệt rồi tạo dự án cho
              lớp mình.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
              >
                Đăng ký
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-indigo-300 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Đăng nhập
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:px-6">
          <Logo />
          <p>Nội dung do AI tạo cần được giáo viên rà soát trước khi sử dụng.</p>
        </div>
      </footer>
    </div>
  );
}
