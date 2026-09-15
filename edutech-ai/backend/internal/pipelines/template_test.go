package pipelines

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeTemplateSpecFixesAndWarns(t *testing.T) {
	spec, warnings := normalizeTemplateSpec(TemplateSpec{
		Sections: []TemplateSection{
			{Name: "", Kind: "matching", Count: 0},
			{Name: "Đọc", Kind: "reading", Count: 99, HasPassage: false},
		},
	})
	if spec.Title != "Bài tập" {
		t.Fatalf("tiêu đề rỗng phải có mặc định, có %q", spec.Title)
	}
	if spec.Sections[0].Name != "Phần 1" || spec.Sections[0].Kind != TplMCQ || spec.Sections[0].Count != 5 {
		t.Fatalf("phần 1 chưa được sửa đúng: %+v", spec.Sections[0])
	}
	if spec.Sections[1].Count != 30 {
		t.Fatalf("số câu bất thường phải bị cắt còn 30, có %d", spec.Sections[1].Count)
	}
	// reading luôn phải có đoạn văn dù model bảo không.
	if !spec.Sections[1].HasPassage {
		t.Fatalf("phần đọc hiểu phải có has_passage=true")
	}
	if len(warnings) < 3 {
		t.Fatalf("cần cảnh báo cho cả 3 chỗ đã sửa, có %d: %v", len(warnings), warnings)
	}
}

func TestTemplateAnalyzeRejectsEmptySample(t *testing.T) {
	_, err := runTemplateAnalyze(&fakeChatter{}, "m", json.RawMessage(`{"sample_text":"   "}`))
	if err == nil || !strings.Contains(err.Error(), "bài tập mẫu") {
		t.Fatalf("phải báo lỗi thiếu bài mẫu, có: %v", err)
	}
}

func TestTemplateAnalyzeReturnsSpec(t *testing.T) {
	res, err := runTemplateAnalyze(&fakeChatter{}, "m",
		json.RawMessage(`{"sample_text":"Exercise 1. Fill in the blanks."}`))
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	spec := res.Content["spec"].(map[string]any)
	secs := spec["sections"].([]any)
	if len(secs) != 2 {
		t.Fatalf("cần 2 phần, có %d", len(secs))
	}
	if res.Content["sample_text"] == "" {
		t.Fatalf("phải giữ lại bài mẫu để bước 2 dùng")
	}
}

func TestTemplateGenerateNumbersContinuously(t *testing.T) {
	in, _ := json.Marshal(TemplateGenerateInput{
		Spec: TemplateSpec{Title: "Unit 3", Sections: []TemplateSection{
			{Name: "Phần A", Kind: TplCloze, Count: 2, HasPassage: true},
			{Name: "Phần B", Kind: TplMCQ, Count: 2},
		}},
		Vocabulary: "recycle, landfill",
		Difficulty: "medium",
	})
	var steps int
	res, err := runTemplateGenerate(&fakeChatter{}, "m", in, func(c, total int, label string) {
		steps++
		if total != 2 {
			t.Fatalf("total = %d, cần 2", total)
		}
	})
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	if steps != 2 {
		t.Fatalf("callback tiến độ gọi %d lần, cần 2", steps)
	}
	want := 1
	for _, p := range res.Content["parts"].([]any) {
		for _, it := range p.(map[string]any)["items"].([]any) {
			got := int(it.(map[string]any)["exam_number"].(float64))
			if got != want {
				t.Fatalf("số câu nhảy cóc: %d, cần %d", got, want)
			}
			want++
		}
	}
	if want-1 != 4 {
		t.Fatalf("tổng %d câu, cần 4", want-1)
	}
}

func TestTemplateGenerateNeedsMaterial(t *testing.T) {
	in, _ := json.Marshal(TemplateGenerateInput{
		Spec: TemplateSpec{Sections: []TemplateSection{{Name: "A", Kind: TplMCQ, Count: 1}}},
	})
	_, err := runTemplateGenerate(&fakeChatter{}, "m", in, nil)
	if err == nil {
		t.Fatalf("không có chủ đề/từ vựng/ngữ pháp thì phải báo lỗi")
	}
}
