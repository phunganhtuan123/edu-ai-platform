package pipelines

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
)

// ActivityInput is the job input for the activity pipeline: a question set
// (same shape as the quiz pipeline output) rendered into a self-contained
// offline HTML quiz game. No model call — pure code templating.
type ActivityInput struct {
	Title     string         `json:"title"`
	Questions []QuizQuestion `json:"questions"`
}

func runActivity(input json.RawMessage) (*Result, error) {
	var in ActivityInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input activity không hợp lệ: %w", err)
	}
	if len(in.Questions) == 0 {
		return nil, fmt.Errorf("cần ít nhất 1 câu hỏi để tạo hoạt động")
	}
	if strings.TrimSpace(in.Title) == "" {
		in.Title = "Quiz Game"
	}

	var warnings []string
	for i := range in.Questions {
		q := &in.Questions[i]
		if len(q.Options) == 0 {
			return nil, fmt.Errorf("câu %d không có lựa chọn nào", i+1)
		}
		if q.AnswerIndex < 0 || q.AnswerIndex >= len(q.Options) {
			warnings = append(warnings, fmt.Sprintf("Câu %d: answer_index=%d không hợp lệ — đã đặt về 0", i+1, q.AnswerIndex))
			q.AnswerIndex = 0
		}
		if strings.TrimSpace(q.Question) == "" {
			warnings = append(warnings, fmt.Sprintf("Câu %d: thiếu nội dung câu hỏi", i+1))
		}
	}

	questionsJSON, err := json.Marshal(in.Questions)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	err = activityTemplate.Execute(&buf, map[string]any{
		"Title":         in.Title,
		"QuestionsJSON": template.JS(questionsJSON),
	})
	if err != nil {
		return nil, fmt.Errorf("render template thất bại: %w", err)
	}

	c, err := toContent(map[string]any{
		"html":          buf.String(),
		"title":         in.Title,
		"num_questions": len(in.Questions),
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    fmt.Sprintf("Quiz game: %s (%d câu)", in.Title, len(in.Questions)),
		Content:  c,
		Warnings: warnings,
	}, nil
}

// activityTemplate is a self-contained, offline, mobile-friendly quiz game
// (Vietnamese UI, inline CSS/JS, per-question feedback, final score screen).
var activityTemplate = template.Must(template.New("activity").Parse(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{.Title}}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .card {
    background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
    width: 100%; max-width: 640px; padding: 28px 24px; text-align: center;
  }
  h1 { color: #4c3a8f; font-size: 1.5rem; margin-bottom: 12px; }
  .progress-bar { background: #eee; border-radius: 99px; height: 10px; margin: 14px 0 6px; overflow: hidden; }
  .progress-fill { background: linear-gradient(90deg, #f6d365, #fda085); height: 100%; width: 0; transition: width .3s; }
  .meta { display: flex; justify-content: space-between; color: #888; font-size: .85rem; margin-bottom: 16px; }
  .badge { display: inline-block; background: #ede9fe; color: #6d28d9; border-radius: 99px; padding: 2px 12px; font-size: .78rem; margin-bottom: 10px; }
  .question { font-size: 1.15rem; color: #333; margin-bottom: 20px; font-weight: 600; line-height: 1.5; text-align: left; }
  .options { display: grid; gap: 10px; }
  .opt {
    border: 2px solid #e5e7eb; background: #fafafa; border-radius: 12px;
    padding: 13px 16px; font-size: 1rem; cursor: pointer; text-align: left;
    transition: transform .12s, border-color .12s, background .12s;
    display: flex; align-items: center; gap: 10px;
  }
  .opt:hover:not(:disabled) { transform: translateY(-2px); border-color: #a78bfa; background: #f5f3ff; }
  .opt:disabled { cursor: default; }
  .opt .letter {
    flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%;
    background: #7c3aed; color: #fff; font-weight: 700; font-size: .85rem;
    display: flex; align-items: center; justify-content: center;
  }
  .opt.correct { border-color: #22c55e; background: #f0fdf4; }
  .opt.correct .letter { background: #22c55e; }
  .opt.wrong { border-color: #ef4444; background: #fef2f2; }
  .opt.wrong .letter { background: #ef4444; }
  .feedback { margin-top: 16px; padding: 12px 14px; border-radius: 12px; font-size: .95rem; text-align: left; display: none; line-height: 1.5; }
  .feedback.good { display: block; background: #f0fdf4; color: #166534; }
  .feedback.bad { display: block; background: #fef2f2; color: #991b1b; }
  .btn {
    margin-top: 20px; border: none; border-radius: 99px; padding: 13px 34px;
    font-size: 1rem; font-weight: 700; color: #fff; cursor: pointer;
    background: linear-gradient(90deg, #7c3aed, #db2777);
    box-shadow: 0 6px 18px rgba(124,58,237,.4); transition: transform .12s;
  }
  .btn:hover { transform: scale(1.04); }
  .hidden { display: none !important; }
  .score-emoji { font-size: 3.4rem; margin-bottom: 8px; }
  .score-big { font-size: 2.6rem; font-weight: 800; color: #7c3aed; margin: 8px 0; }
  .score-msg { color: #555; margin-bottom: 8px; font-size: 1.05rem; }
  @media (max-width: 480px) {
    .card { padding: 20px 14px; }
    h1 { font-size: 1.25rem; }
    .question { font-size: 1.05rem; }
  }
</style>
</head>
<body>
<div class="card">
  <div id="start-screen">
    <div class="score-emoji">🎯</div>
    <h1>{{.Title}}</h1>
    <p class="score-msg" id="intro-count"></p>
    <button class="btn" onclick="startGame()">Bắt đầu 🚀</button>
  </div>

  <div id="quiz-screen" class="hidden">
    <h1>{{.Title}}</h1>
    <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
    <div class="meta"><span id="q-counter"></span><span id="score-counter"></span></div>
    <div class="badge" id="bloom"></div>
    <div class="question" id="question"></div>
    <div class="options" id="options"></div>
    <div class="feedback" id="feedback"></div>
    <button class="btn hidden" id="next-btn" onclick="nextQuestion()">Câu tiếp theo ➜</button>
  </div>

  <div id="end-screen" class="hidden">
    <div class="score-emoji" id="end-emoji"></div>
    <h1>Hoàn thành!</h1>
    <div class="score-big" id="final-score"></div>
    <p class="score-msg" id="final-msg"></p>
    <button class="btn" onclick="startGame()">Chơi lại 🔄</button>
  </div>
</div>

<script>
var QUESTIONS = {{.QuestionsJSON}};
var LETTERS = ["A", "B", "C", "D", "E", "F"];
var current = 0, score = 0;

document.getElementById("intro-count").textContent = QUESTIONS.length + " câu hỏi — sẵn sàng chưa?";

function show(id) {
  ["start-screen", "quiz-screen", "end-screen"].forEach(function (s) {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  });
}

function startGame() {
  current = 0; score = 0;
  show("quiz-screen");
  renderQuestion();
}

function renderQuestion() {
  var q = QUESTIONS[current];
  document.getElementById("progress").style.width = (current / QUESTIONS.length * 100) + "%";
  document.getElementById("q-counter").textContent = "Câu " + (current + 1) + "/" + QUESTIONS.length;
  document.getElementById("score-counter").textContent = "Điểm: " + score;
  document.getElementById("bloom").textContent = q.bloom_level || "";
  document.getElementById("bloom").style.display = q.bloom_level ? "inline-block" : "none";
  document.getElementById("question").textContent = q.question;
  var fb = document.getElementById("feedback");
  fb.className = "feedback"; fb.textContent = "";
  document.getElementById("next-btn").classList.add("hidden");

  var box = document.getElementById("options");
  box.innerHTML = "";
  q.options.forEach(function (opt, i) {
    var btn = document.createElement("button");
    btn.className = "opt";
    var letter = document.createElement("span");
    letter.className = "letter"; letter.textContent = LETTERS[i] || (i + 1);
    var text = document.createElement("span");
    text.textContent = opt;
    btn.appendChild(letter); btn.appendChild(text);
    btn.onclick = function () { answer(i, btn); };
    box.appendChild(btn);
  });
}

function answer(i, btn) {
  var q = QUESTIONS[current];
  var buttons = document.querySelectorAll("#options .opt");
  buttons.forEach(function (b) { b.disabled = true; });
  buttons[q.answer_index].classList.add("correct");
  var fb = document.getElementById("feedback");
  if (i === q.answer_index) {
    score++;
    fb.className = "feedback good";
    fb.textContent = "🎉 Chính xác! " + (q.explanation || "");
  } else {
    btn.classList.add("wrong");
    fb.className = "feedback bad";
    fb.textContent = "😅 Chưa đúng. Đáp án: " + (LETTERS[q.answer_index] || "") + ". " + (q.explanation || "");
  }
  document.getElementById("score-counter").textContent = "Điểm: " + score;
  document.getElementById("next-btn").classList.remove("hidden");
  document.getElementById("next-btn").textContent =
    current === QUESTIONS.length - 1 ? "Xem kết quả 🏁" : "Câu tiếp theo ➜";
}

function nextQuestion() {
  current++;
  if (current >= QUESTIONS.length) { endGame(); } else { renderQuestion(); }
}

function endGame() {
  show("end-screen");
  var pct = score / QUESTIONS.length;
  document.getElementById("final-score").textContent = score + " / " + QUESTIONS.length;
  var emoji, msg;
  if (pct === 1) { emoji = "🏆"; msg = "Tuyệt đối! Em là siêu sao!"; }
  else if (pct >= 0.8) { emoji = "🌟"; msg = "Xuất sắc! Cố thêm chút nữa là hoàn hảo!"; }
  else if (pct >= 0.5) { emoji = "👍"; msg = "Khá lắm! Ôn lại các câu sai nhé!"; }
  else { emoji = "💪"; msg = "Đừng nản! Luyện tập thêm rồi thử lại nào!"; }
  document.getElementById("end-emoji").textContent = emoji;
  document.getElementById("final-msg").textContent = msg;
}
</script>
</body>
</html>
`))
