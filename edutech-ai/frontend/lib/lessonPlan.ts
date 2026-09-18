// Giáo án điện tử (lesson_plan): kiểu dữ liệu, chuẩn hoá, lựa chọn theo cấp học
// và dựng HTML tự chứa để in / tải về. Mọi chuỗi từ AI đều được escape — file
// xuất ra không có script và bị CSP chặn mọi tài nguyên ngoài.

export interface LessonActivity {
  title: string;
  duration_minutes: number;
  teacher_actions: string[];
  student_actions: string[];
  resources: string[];
}

export interface LessonPlanContent {
  title: string;
  topic: string;
  grade_level: string;
  subject: string;
  class_name: string;
  age_group: string;
  duration_minutes: number;
  objectives: string[];
  materials: string[];
  activities: LessonActivity[];
  assessment: string[];
  differentiation: string[];
  warnings: string[];
}

function str(x: any): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

/** Chấp nhận mảng chuỗi hoặc một chuỗi nhiều dòng; bỏ dòng trống. */
function lines(x: any): string[] {
  const raw = Array.isArray(x) ? x.map(str) : str(x).split(/\r?\n/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

function minutes(x: any): number {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeLessonPlan(content: any): LessonPlanContent {
  const c = content || {};
  const activities: LessonActivity[] = (Array.isArray(c.activities) ? c.activities : []).map(
    (a: any, i: number) => ({
      title: str(a?.title).trim() || `Hoạt động ${i + 1}`,
      duration_minutes: minutes(a?.duration_minutes),
      teacher_actions: lines(a?.teacher_actions),
      student_actions: lines(a?.student_actions),
      resources: lines(a?.resources),
    })
  );
  return {
    title: str(c.title).trim(),
    topic: str(c.topic).trim(),
    grade_level: str(c.grade_level),
    subject: str(c.subject),
    class_name: str(c.class_name),
    age_group: str(c.age_group),
    duration_minutes: minutes(c.duration_minutes),
    objectives: lines(c.objectives),
    materials: lines(c.materials),
    activities,
    assessment: lines(c.assessment),
    differentiation: lines(c.differentiation),
    warnings: lines(c.warnings),
  };
}

// ---------- Lựa chọn theo cấp học ----------

export const GRADE_LABELS: Record<string, string> = {
  mamnon: "Mầm non",
  tieuhoc: "Tiểu học",
  thcs: "THCS",
  thpt: "THPT",
};

export const SUBJECT_LABELS: Record<string, string> = {
  english: "Tiếng Anh",
  mamnon_chung: "Giáo dục mầm non",
  math: "Toán",
  science: "Khoa học tự nhiên",
  literature: "Ngữ văn",
};

/**
 * Nhóm/lớp mầm non (khớp /meta/mindmap của backend) kèm thời lượng một hoạt
 * động học gợi ý theo độ tuổi — giáo viên vẫn sửa được.
 */
export const MAMNON_AGE_GROUPS: { key: string; name_vi: string; minutes: number; range: string }[] = [
  { key: "nha_tre", name_vi: "Nhà trẻ (24–36 tháng)", minutes: 12, range: "10–15 phút" },
  { key: "mg_be", name_vi: "Mẫu giáo bé (3–4 tuổi)", minutes: 18, range: "15–20 phút" },
  { key: "mg_nho", name_vi: "Mẫu giáo nhỡ (4–5 tuổi)", minutes: 25, range: "20–25 phút" },
  { key: "mg_lon", name_vi: "Mẫu giáo lớn (5–6 tuổi)", minutes: 30, range: "25–35 phút" },
];

export function ageGroupName(key: string): string {
  return MAMNON_AGE_GROUPS.find((a) => a.key === key)?.name_vi || key;
}

const CLASS_RANGES: Record<string, [number, number]> = {
  tieuhoc: [1, 5],
  thcs: [6, 9],
  thpt: [10, 12],
};

export function classOptions(grade: string): string[] {
  const r = CLASS_RANGES[grade];
  if (!r) return [];
  const out: string[] = [];
  for (let i = r[0]; i <= r[1]; i++) out.push(`Lớp ${i}`);
  return out;
}

/** Thời lượng một tiết theo cấp: tiểu học 35 phút, THCS/THPT 45 phút. */
export function defaultDuration(grade: string, ageGroup?: string): number {
  if (grade === "mamnon") {
    return MAMNON_AGE_GROUPS.find((a) => a.key === ageGroup)?.minutes || 25;
  }
  return grade === "tieuhoc" ? 35 : 45;
}

export function durationPresets(grade: string): number[] {
  if (grade === "mamnon") return [10, 15, 20, 25, 30, 35];
  if (grade === "tieuhoc") return [35, 70];
  return [45, 90];
}

export const DURATION_MIN = 5;
export const DURATION_MAX = 180;

/** Dòng mô tả lớp/nhóm tuổi + môn, dùng chung cho màn xem, in và trình chiếu. */
export function lessonMetaLine(lp: LessonPlanContent): string {
  return [
    lp.subject ? SUBJECT_LABELS[lp.subject] || lp.subject : "",
    lp.grade_level === "mamnon" && lp.age_group
      ? ageGroupName(lp.age_group)
      : lp.class_name || GRADE_LABELS[lp.grade_level] || lp.grade_level,
    lp.duration_minutes ? `${lp.duration_minutes} phút` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function activitiesTotal(lp: LessonPlanContent): number {
  return lp.activities.reduce((s, a) => s + a.duration_minutes, 0);
}

// ---------- HTML tự chứa ----------

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function list(items: string[], empty = "—"): string {
  if (!items.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

const HTML_CSS = `
*{box-sizing:border-box}
body{margin:0;padding:32px 20px;background:#f8fafc;color:#1e293b;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.55}
main{max-width:960px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px 40px}
header{border-bottom:2px solid #4f46e5;padding-bottom:16px;margin-bottom:24px}
.eyebrow{margin:0;color:#4f46e5;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
h1{margin:6px 0 4px;font-size:26px;line-height:1.25}
.meta{margin:0;color:#64748b;font-size:14px}
h2{margin:28px 0 10px;font-size:17px;color:#312e81}
ul{margin:0;padding-left:20px}li{margin:3px 0}
.muted{color:#94a3b8;margin:0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid #cbd5e1;padding:10px;vertical-align:top;text-align:left}
th{background:#eef2ff;color:#312e81;font-size:13px}
td.act{width:22%;font-weight:600}
.dur{display:inline-block;margin-top:4px;font-weight:500;color:#475569;font-size:12px}
.warn{margin-top:28px;border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:12px 16px;font-size:13px;color:#92400e}
.foot{margin-top:28px;color:#94a3b8;font-size:12px}
@media(max-width:700px){main{padding:22px 18px}.grid{grid-template-columns:1fr}td.act{width:auto}}
@media print{body{background:#fff;padding:0}main{border:0;border-radius:0;padding:0;max-width:none}
tr,li{break-inside:avoid}h2{break-after:avoid}.warn{display:none}}
@page{size:A4;margin:16mm 14mm}
`;

export function buildLessonPlanHtml(lp: LessonPlanContent, fallbackTitle = "Giáo án"): string {
  const title = lp.title || lp.topic || fallbackTitle;
  const rows = lp.activities
    .map(
      (a, i) => `<tr>
<td class="act">${i + 1}. ${esc(a.title)}${
        a.duration_minutes ? `<br><span class="dur">${a.duration_minutes} phút</span>` : ""
      }</td>
<td>${list(a.teacher_actions)}</td>
<td>${list(a.student_actions)}</td>
<td>${list(a.resources)}</td>
</tr>`
    )
    .join("");
  const warnings = lp.warnings.length
    ? `<div class="warn"><strong>Cảnh báo cần rà soát (không in):</strong>${list(lp.warnings)}</div>`
    : "";
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(title)}</title>
<style>${HTML_CSS}</style>
</head>
<body>
<main>
<header>
<p class="eyebrow">Kế hoạch bài dạy</p>
<h1>${esc(title)}</h1>
<p class="meta">${esc(lessonMetaLine(lp))}</p>
</header>
<div class="grid">
<section><h2>I. Mục tiêu</h2>${list(lp.objectives)}</section>
<section><h2>II. Chuẩn bị</h2>${list(lp.materials)}</section>
</div>
<h2>III. Tiến trình hoạt động</h2>
${
  lp.activities.length
    ? `<table><thead><tr><th>Hoạt động</th><th>Hoạt động của giáo viên</th><th>Hoạt động của ${
        lp.grade_level === "mamnon" ? "trẻ" : "học sinh"
      }</th><th>Học liệu</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="muted">Chưa có hoạt động.</p>`
}
<div class="grid">
<section><h2>IV. Đánh giá</h2>${list(lp.assessment)}</section>
<section><h2>V. Phân hoá / hỗ trợ</h2>${list(lp.differentiation)}</section>
</div>
${warnings}
<p class="foot">Bản nháp do AI gợi ý — giáo viên rà soát, điều chỉnh cho phù hợp lớp trước khi sử dụng.</p>
</main>
</body>
</html>`;
}

/**
 * In qua iframe ẩn (không mở cửa sổ mới để tránh trình chặn pop-up). HTML đã
 * escape toàn bộ và không có script.
 */
export function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  };
  if (doc.readyState === "complete") window.setTimeout(run, 50);
  else iframe.onload = run;
}
