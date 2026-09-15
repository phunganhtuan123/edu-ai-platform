import type { ExamContent, ExamSection } from "./types";

/**
 * Dựng file HTML tự chứa cho một đề đã sinh — mở bằng trình duyệt là làm được
 * ngay, không cần mạng, không cần server. Dùng cho nút "Xuất HTML" và cho bản
 * in PDF (cùng một nguồn dữ liệu, khác lớp trình bày).
 *
 * Bố cục theo yêu cầu: CÂU HỎI BÊN TRÁI, ĐOẠN VĂN BÊN PHẢI (đoạn văn dính
 * mép trên khi cuộn, để đọc và chọn đáp án cùng lúc).
 */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Tên file an toàn từ tiêu đề tiếng Việt.
 *
 * Tự bỏ dấu bằng bảng tra chứ không dùng unicode property escape (\p{L} cần
 * target ES6) và không dùng String.normalize (không có trong lib ES5).
 */
const VN_MAP: Record<string, string> = {
  a: "\u00e0\u00e1\u1ea1\u1ea3\u00e3\u00e2\u1ea7\u1ea5\u1eadu\u1ea9\u1eab\u0103\u1eb1\u1eaf\u1eb7\u1eb3\u1eb5",
  e: "\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ec1\u1ebf\u1ec7\u1ec3\u1ec5",
  i: "\u00ec\u00ed\u1ecb\u1ec9\u0129",
  o: "\u00f2\u00f3\u1ecd\u1ecf\u00f5\u00f4\u1ed3\u1ed1\u1ed9\u1ed5\u1ed7\u01a1\u1edd\u1edb\u1ee3\u1edf\u1ee1",
  u: "\u00f9\u00fa\u1ee5\u1ee7\u0169\u01b0\u1eeb\u1ee9\u1ef1\u1eed\u1eef",
  y: "\u1ef3\u00fd\u1ef5\u1ef7\u1ef9",
  d: "\u0111",
};

export function slugify(input: string, fallback = "de-thi"): string {
  let out = String(input || "").toLowerCase();
  Object.keys(VN_MAP).forEach((plain) => {
    VN_MAP[plain].split("").forEach((ch) => {
      out = out.split(ch).join(plain);
    });
  });
  out = out.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return out || fallback;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Nhúng JSON vào <script> an toàn: chặn chuỗi "</script>" cắt sớm thẻ script. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const SKIN_CSS = `
:root{--paper:#f6f4ec;--panel:#fff;--ink:#22201b;--faint:#7d786c;--rule:#d8d3c4;
--navy:#17233f;--seal:#b3311f;--sealdark:#7f2013;--pass:#2f6b47;
--serif:Georgia,'Times New Roman',serif;
--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--sans);line-height:1.6;color:var(--ink);max-width:1200px;margin:0 auto;
padding:20px;background-color:var(--paper);
background-image:repeating-linear-gradient(90deg,transparent 0 26px,rgba(23,35,63,.025) 26px 27px)}
.header{background:var(--navy);color:#f4f1e6;border-bottom:3px solid var(--seal);padding:22px 26px;margin-bottom:24px}
.header .eyebrow{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#f0d7c4;margin-bottom:6px}
.header h1{font-family:var(--serif);font-size:1.7rem}
.header h2{font-family:var(--serif);font-style:italic;font-weight:400;font-size:1rem;opacity:.85}
.part{margin-bottom:34px}
.part-name{font-family:var(--serif);color:var(--navy);font-size:1.05rem;font-weight:700;
border-bottom:1px solid var(--rule);padding-bottom:8px;margin-bottom:6px}
.instructions{font-family:var(--serif);font-style:italic;color:var(--ink);margin:10px 0 14px}
/* Câu hỏi trái · đoạn văn phải */
.quiz-container{display:grid;grid-template-columns:1fr 1fr;gap:30px}
.quiz-container.no-passage{grid-template-columns:1fr}
@media(max-width:768px){.quiz-container{grid-template-columns:1fr}
.passage-section{position:static!important;max-height:none!important;order:-1}}
.passage-section{grid-column:2;background:var(--panel);border:1px solid var(--rule);padding:25px;
position:sticky;top:20px;max-height:80vh;overflow-y:auto;
box-shadow:0 1px 0 var(--rule),0 10px 24px rgba(23,35,63,.06)}
.passage-section h3{font-family:var(--serif);color:var(--faint);font-size:.8rem;letter-spacing:.12em;
text-transform:uppercase;border-bottom:1px solid var(--rule);padding-bottom:10px;margin-bottom:15px}
.passage-content{background:var(--paper);border:1px solid var(--rule);padding:20px;
white-space:pre-wrap;font-family:var(--serif);font-size:.98rem;line-height:1.8}
.questions-section{grid-column:1;grid-row:1;background:var(--panel);border:1px solid var(--rule);padding:25px;
box-shadow:0 1px 0 var(--rule),0 10px 24px rgba(23,35,63,.06)}
.quiz-container.no-passage .questions-section{grid-column:1}
.question-block{border-bottom:1px solid var(--rule);padding:16px 4px}
.question-block:last-child{border-bottom:0}
.question-number{font-family:var(--serif);color:var(--navy);font-size:.95rem;font-weight:700;margin-bottom:10px}
.item-type{background:transparent;color:var(--faint);border:1px solid var(--rule);padding:2px 8px;
font-size:.7rem;font-weight:600;letter-spacing:.04em;margin-left:10px}
.question-text{font-family:var(--serif);margin-bottom:12px}
.jumbled-items{background:var(--paper);border:1px solid var(--rule);padding:15px;margin-bottom:14px}
.jumbled-item{background:var(--panel);border:1px solid var(--rule);padding:8px 12px;margin:5px 0;
font-family:var(--serif);font-size:.9rem}
.option{display:flex;align-items:flex-start;border:1px solid var(--rule);background:var(--panel);
padding:9px 12px;margin:8px 0;transition:border-color .15s,background .15s}
.option:has(input:checked){border-color:var(--seal);background:#fbf3f0}
.option input[type=radio]{margin-right:10px;margin-top:3px;width:16px;height:16px;accent-color:var(--seal)}
.option label{cursor:pointer;font-size:.95rem;line-height:1.5}
.controls{text-align:center;margin:30px 0}
.btn{padding:12px 24px;margin:0 8px;border:none;font-size:1rem;font-weight:600;cursor:pointer;
font-family:var(--serif)}
.btn-primary{background:var(--seal);color:#fff;box-shadow:0 2px 0 var(--sealdark)}
.btn-primary:hover{background:var(--sealdark)}
.btn-secondary{background:var(--navy);color:#fff}
.results{background:var(--panel);border:1px solid var(--rule);padding:25px;margin-top:30px}
.score{text-align:center;font-size:1.5rem;font-weight:700;font-family:var(--serif);padding:20px;margin-bottom:20px}
.score.good{background:#eef5f0;color:var(--pass);border:1px solid #bcd9c7}
.score.average{background:#fbf6ec;color:#8a6a1e;border:1px solid #e6d6ad}
.score.poor{background:#fbf1ef;color:var(--seal);border:1px solid #e6c3bc}
.feedback-item{margin:15px 0;padding:15px;border-left:4px solid}
.feedback-item.correct{background:#f1f6f2;border-left-color:var(--pass)}
.feedback-item.incorrect{background:#fbf1ef;border-left-color:var(--seal)}
.feedback-question{font-family:var(--serif);color:var(--navy);font-weight:700;margin-bottom:8px}
.feedback-explanation{margin-top:10px;padding:10px;background:var(--paper);border:1px solid var(--rule);font-size:.9rem}
.hidden{display:none}
`;

/** Các câu của một phần, kèm số thứ tự toàn đề. */
function renderQuestions(part: ExamSection, interactive: boolean): string {
  return part.questions
    .map((q, i) => {
      const key = `q_${part.part_id}_${q.number}`;
      // Dạng sắp xếp câu: đề bài là các câu rời a/b/c/d, tách ra thành khối riêng.
      const jumbled =
        part.kind === "ordering" && q.prompt
          ? `<div class="jumbled-items">${q.prompt
              .split("\n")
              .filter(Boolean)
              .map((line) => `<div class="jumbled-item">${esc(line)}</div>`)
              .join("")}</div>`
          : "";
      const promptHtml =
        q.prompt && part.kind !== "ordering"
          ? `<p class="question-text">${esc(q.prompt)}</p>`
          : part.kind === "ordering"
            ? `<p class="question-text">Chọn thứ tự đúng:</p>`
            : `<p class="question-text">Chọn đáp án đúng cho chỗ trống (${q.number}).</p>`;

      const options = q.options
        .map((opt, j) => {
          const letter = LETTERS[j] || String(j + 1);
          if (!interactive) {
            return `<div class="option"><label><strong>${letter}.</strong> ${esc(opt)}</label></div>`;
          }
          const id = `${key}_${letter}`;
          return `<div class="option">
  <input type="radio" name="${key}" value="${letter}" id="${id}">
  <label for="${id}"><strong>${letter}.</strong> ${esc(opt)}</label>
</div>`;
        })
        .join("");

      return `<div class="question-block">
  <p class="question-number">Question ${q.number}${
    q.tested_point ? `<span class="item-type">${esc(q.tested_point)}</span>` : ""
  }</p>
  ${jumbled}${promptHtml}
  <div class="options">${options}</div>
</div>`;
    })
    .join("\n");
}

function renderPart(part: ExamSection, interactive: boolean): string {
  const hasPassage = !!part.passage;
  return `<div class="part">
  ${part.part_name ? `<div class="part-name">${esc(part.part_name)}</div>` : ""}
  ${part.instruction ? `<p class="instructions">${esc(part.instruction)}</p>` : ""}
  <div class="quiz-container${hasPassage ? "" : " no-passage"}">
    <div class="questions-section">${renderQuestions(part, interactive)}</div>
    ${
      hasPassage
        ? `<div class="passage-section">
      <h3>Passage with Blanks</h3>
      ${part.title ? `<p style="font-family:var(--serif);font-weight:700;margin-bottom:10px">${esc(part.title)}</p>` : ""}
      <div class="passage-content">${esc(part.passage)}</div>
    </div>`
        : ""
    }
  </div>
</div>`;
}

type AnswerMap = Record<
  string,
  {
    number: number;
    letter: string;
    partName: string;
    testedPoint: string;
    explanation: string;
  }
>;

function buildAnswerMap(content: ExamContent): AnswerMap {
  const map: AnswerMap = {};
  content.parts.forEach((part) => {
    part.questions.forEach((q) => {
      map[`q_${part.part_id}_${q.number}`] = {
        number: q.number,
        letter: LETTERS[q.correct_index] || "?",
        partName: part.part_name,
        testedPoint: q.tested_point || "",
        explanation: q.explanation || "",
      };
    });
  });
  return map;
}

/** File HTML tương tác: chọn đáp án, nộp bài, chấm điểm và xem giải thích. */
export function buildInteractiveHtml(
  content: ExamContent,
  title = "Đề thi"
): string {
  const answers = buildAnswerMap(content);
  const subtitle =
    content.parts.length > 1
      ? `${content.parts.length} phần · ${Object.keys(answers).length} câu`
      : content.parts[0]?.part_name || "";

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>${SKIN_CSS}</style>
</head>
<body>
<div class="header">
  <div class="eyebrow">Đề thi · Exam</div>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<h2>${esc(subtitle)}</h2>` : ""}
</div>

<form id="quizForm">
${content.parts.map((p) => renderPart(p, true)).join("\n")}
  <div class="controls">
    <button type="submit" class="btn btn-primary">Nộp bài</button>
    <button type="button" class="btn btn-secondary" onclick="resetQuiz()">Làm lại</button>
  </div>
</form>

<div id="results" class="results hidden">
  <div id="scoreDisplay" class="score"></div>
  <div id="detailedFeedback"></div>
  <div class="controls">
    <button type="button" class="btn btn-primary" onclick="resetQuiz()">Làm lại</button>
  </div>
</div>

<script>
var ANSWERS = ${safeJson(answers)};
var STORAGE_KEY = ${safeJson("exam_progress_" + title)};

document.getElementById('quizForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var data = new FormData(this), picked = {}, score = 0;
  var keys = Object.keys(ANSWERS);
  data.forEach(function (v, k) { picked[k] = v; });
  keys.forEach(function (k) { if (picked[k] === ANSWERS[k].letter) score++; });

  var pct = keys.length ? Math.round((score / keys.length) * 100) : 0;
  var cls = pct >= 80 ? 'good' : pct >= 60 ? 'average' : 'poor';
  var el = document.getElementById('scoreDisplay');
  el.className = 'score ' + cls;
  el.innerHTML = '<div>Kết quả: ' + score + '/' + keys.length + ' (' + pct + '%)</div>';

  var html = '<h3 style="font-family:var(--serif);margin-bottom:10px">Chi tiết từng câu</h3>';
  keys.forEach(function (k) {
    var a = ANSWERS[k], mine = picked[k], ok = mine === a.letter;
    html += '<div class="feedback-item ' + (ok ? 'correct' : 'incorrect') + '">' +
      '<div class="feedback-question">Câu ' + a.number + ' ' + (ok ? '✓' : '✗') +
      (a.testedPoint ? '<span class="item-type">' + a.testedPoint + '</span>' : '') + '</div>' +
      '<div>Bạn chọn: <strong>' + (mine || 'chưa chọn') +
      '</strong> · Đáp án: <strong>' + a.letter + '</strong></div>' +
      (a.explanation ? '<div class="feedback-explanation">' + a.explanation + '</div>' : '') +
      '</div>';
  });
  document.getElementById('detailedFeedback').innerHTML = html;

  document.getElementById('quizForm').style.display = 'none';
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
});

function resetQuiz() {
  document.getElementById('quizForm').reset();
  document.getElementById('quizForm').style.display = 'block';
  document.getElementById('results').classList.add('hidden');
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Nhớ bài đang làm dở. Bọc try/catch: chế độ riêng tư chặn localStorage và sẽ
// ném lỗi, không được để việc đó làm hỏng cả trang.
document.addEventListener('change', function (e) {
  if (e.target && e.target.type === 'radio') {
    try {
      var p = {};
      new FormData(document.getElementById('quizForm')).forEach(function (v, k) { p[k] = v; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (err) {}
  }
});
window.addEventListener('load', function () {
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    var p = JSON.parse(saved);
    Object.keys(p).forEach(function (k) {
      var el = document.querySelector('input[name="' + k + '"][value="' + p[k] + '"]');
      if (el) el.checked = true;
    });
  } catch (err) {}
});
</script>
</body>
</html>`;
}

/** Bản in: không có ô chọn, có bảng đáp án cuối đề cho giáo viên. */
export function buildPrintHtml(content: ExamContent, title = "Đề thi"): string {
  const keyRows = content.parts
    .flatMap((p) => p.questions)
    .map(
      (q) =>
        `<span style="display:inline-block;min-width:110px;margin:2px 0">Câu ${q.number}: <strong>${
          LETTERS[q.correct_index] || "?"
        }</strong></span>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${SKIN_CSS}
@page{margin:14mm}
body{background:#fff;background-image:none;max-width:none;padding:0}
.passage-section{position:static;max-height:none;box-shadow:none}
.questions-section{box-shadow:none}
.part{break-inside:avoid}
.question-block{break-inside:avoid}
.answer-key{margin-top:24px;padding:16px;border:1px solid var(--rule);background:#fafaf7;break-before:page}
.answer-key h3{font-family:var(--serif);color:var(--navy);margin-bottom:10px}
</style>
</head>
<body>
<div class="header">
  <div class="eyebrow">Đề thi · Exam</div>
  <h1>${esc(title)}</h1>
</div>
${content.parts.map((p) => renderPart(p, false)).join("\n")}
<div class="answer-key">
  <h3>Đáp án (dành cho giáo viên)</h3>
  <div>${keyRows}</div>
</div>
</body>
</html>`;
}

/**
 * Mở hộp thoại in của trình duyệt để lưu PDF.
 *
 * Dùng iframe ẩn chứ không window.open: trình chặn pop-up chặn cửa sổ mới, và
 * người dùng chỉ thấy nút bấm không phản ứng gì.
 */
export function printExam(content: ExamContent, title = "Đề thi") {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(buildPrintHtml(content, title));
  doc.close();

  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Gỡ iframe sau khi hộp thoại in đóng. Đợi một nhịp vì print() ở một số
    // trình duyệt trả về ngay trước khi hộp thoại hiện xong.
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };
  if (iframe.contentWindow?.document.readyState === "complete") run();
  else iframe.onload = run;
}
