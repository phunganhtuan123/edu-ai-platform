package pipelines

import (
	"encoding/json"
	"strings"
	"testing"
)

// fakeChatter trả JSON cố định theo schema mà mỗi kind yêu cầu, để test logic
// phía code (đánh số, xáo phương án, validator) mà không cần server Ollama.
type fakeChatter struct{ calls int }

func (f *fakeChatter) ChatStructured(model, system, user string, schema map[string]any) (string, error) {
	f.calls++
	props, _ := schema["properties"].(map[string]any)
	if _, ok := props["sections"]; ok {
		return `{"title":"Bài tập Unit 3","sections":[
			{"name":"Phần A","kind":"cloze","count":2,"has_passage":true,"notes":"Giới từ"},
			{"name":"Phần B","kind":"mcq","count":2,"has_passage":false,"notes":"Từ vựng"}]}`, nil
	}
	if items, ok := props["items"].(map[string]any); ok {
		if it, ok := items["items"].(map[string]any); ok {
			if ip, ok := it["properties"].(map[string]any); ok {
				if _, isMCQ := ip["question"]; isMCQ {
					return `{"items":[
						{"question":"She is good _____ maths.","options":["at","in","on","for"],"correct_option":"at","tested_point":"giới từ","explanation":"good at."},
						{"question":"He _____ to school daily.","options":["goes","go","going","gone"],"correct_option":"goes","tested_point":"chia động từ","explanation":"Ngôi thứ ba số ít."}]}`, nil
				}
			}
		}
	}
	if _, ok := props["passage"]; ok {
		if _, isReading := props["questions"]; isReading {
			return `{"title":"T","passage":"A passage about clubs. It has two sentences.","questions":[
				{"question":"What is it about?","options":["Clubs","Cars","Food","Trees"],"correct_option":"Clubs","explanation":"Câu đầu nói về clubs."},
				{"question":"How many sentences?","options":["One","Two","Three","Four"],"correct_option":"Two","explanation":"Đếm được hai câu."}]}`, nil
		}
		return `{"title":"N","passage":"Students (1)_____ join the club before (2)_____ deadline.","items":[
			{"blank_number":1,"options":["may","musts","cans","shalling"],"correct_option":"may","tested_point":"động từ khuyết thiếu"},
			{"blank_number":2,"options":["the","a","an","some"],"correct_option":"the","tested_point":"mạo từ"}]}`, nil
	}
	return `{"items":[{"sentences":["Sure, see you then.","Are you free on Friday?","Great, 7pm works.","Yes, after five."],"correct_order":[2,4,3,1],"explanation":"Hỏi trước, đáp sau."}]}`, nil
}

func TestRunExamNumbersPartsContinuously(t *testing.T) {
	in, _ := json.Marshal(ExamInput{
		Parts:      []string{"p1_cloze_notice", "p3_ordering", "p5_reading_info"},
		Counts:     map[string]int{"p1_cloze_notice": 2, "p3_ordering": 1, "p5_reading_info": 2},
		Topic:      "School clubs",
		Difficulty: "hard",
	})

	var seen []string
	res, err := runExam(&fakeChatter{}, "m", in, func(cur, total int, label string) {
		seen = append(seen, label)
		if total != 3 {
			t.Fatalf("total tiến độ = %d, cần 3", total)
		}
	})
	if err != nil {
		t.Fatalf("runExam lỗi: %v", err)
	}
	if len(seen) != 3 {
		t.Fatalf("callback tiến độ gọi %d lần, cần 3", len(seen))
	}

	parts, _ := res.Content["parts"].([]any)
	if len(parts) != 3 {
		t.Fatalf("có %d phần, cần 3", len(parts))
	}

	// Số câu phải chạy liên tục 1..5 xuyên suốt ba phần.
	want := 1
	for _, p := range parts {
		sec := p.(map[string]any)
		items, _ := sec["items"].([]any)
		for _, it := range items {
			got := int(it.(map[string]any)["exam_number"].(float64))
			if got != want {
				t.Fatalf("số câu nhảy cóc: gặp %d, cần %d", got, want)
			}
			want++
		}
	}
	if want-1 != 5 {
		t.Fatalf("tổng số câu = %d, cần 5", want-1)
	}

	// Blank trong đoạn văn phải được đánh lại theo số câu của đề.
	first := parts[0].(map[string]any)
	if !strings.Contains(first["passage"].(string), "(1)_____") ||
		!strings.Contains(first["passage"].(string), "(2)_____") {
		t.Fatalf("đoạn văn chưa đánh số đúng: %q", first["passage"])
	}
}

func TestRunExamAnswerIndexSurvivesShuffle(t *testing.T) {
	in, _ := json.Marshal(ExamInput{
		Parts:  []string{"p5_reading_info"},
		Counts: map[string]int{"p5_reading_info": 2},
		Topic:  "Clubs",
	})
	// Chạy nhiều lần vì vị trí đáp án do code xáo ngẫu nhiên.
	for i := 0; i < 20; i++ {
		res, err := runExam(&fakeChatter{}, "m", in, nil)
		if err != nil {
			t.Fatalf("runExam lỗi: %v", err)
		}
		sec := res.Content["parts"].([]any)[0].(map[string]any)
		for _, raw := range sec["items"].([]any) {
			it := raw.(map[string]any)
			opts := it["options"].([]any)
			idx := int(it["answer_index"].(float64))
			if idx < 0 || idx >= len(opts) {
				t.Fatalf("answer_index %d ngoài khoảng", idx)
			}
			if opts[idx].(string) != it["correct_option"].(string) {
				t.Fatalf("xáo phương án làm lệch đáp án: options[%d]=%q, correct=%q",
					idx, opts[idx], it["correct_option"])
			}
		}
	}
}

func TestRunExamWarnsOnUnconfirmedCount(t *testing.T) {
	in, _ := json.Marshal(ExamInput{Parts: []string{"p3_ordering"}, Topic: "X"})
	res, err := runExam(&fakeChatter{}, "m", in, nil)
	if err != nil {
		t.Fatalf("runExam lỗi: %v", err)
	}
	found := false
	for _, w := range res.Warnings {
		if strings.Contains(w, "CHƯA đối chiếu đề minh hoạ") {
			found = true
		}
	}
	if !found {
		t.Fatalf("thiếu cảnh báo số câu chưa chốt, warnings=%v", res.Warnings)
	}
}

func TestRunExamLegacySectionInput(t *testing.T) {
	// Job cũ lưu trước spec 1.2 vẫn phải chạy được.
	res, err := runExam(&fakeChatter{}, "m", json.RawMessage(`{"section":"notice","topic":"Clubs"}`), nil)
	if err != nil {
		t.Fatalf("input cũ không chạy được: %v", err)
	}
	if len(res.Content["parts"].([]any)) != 1 {
		t.Fatalf("input cũ phải ra đúng 1 phần")
	}
}

func TestOrderingDistractorsAreDistinct(t *testing.T) {
	correct := []int{1, 2, 3, 4}
	for i := 0; i < 50; i++ {
		got := distractorOrders(correct)
		if len(got) != 3 {
			t.Fatalf("cần 3 phương án nhiễu, có %d", len(got))
		}
		seen := map[string]bool{orderToLabels(correct): true}
		for _, d := range got {
			k := orderToLabels(d)
			if seen[k] {
				t.Fatalf("phương án nhiễu trùng nhau hoặc trùng đáp án: %s", k)
			}
			seen[k] = true
		}
	}
}
