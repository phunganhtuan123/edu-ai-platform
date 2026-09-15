package pipelines

import (
	"strconv"
	"strings"
)

// Độ khó dùng chung cho mọi module sinh đề (spec mục 2c).
//
// Lưu ý đã ghi trong spec và PHẢI hiện trên UI: mức độ khó do model diễn giải
// nên có thể lệch — giáo viên vẫn phải duyệt lại. Code chỉ đưa mức vào prompt
// và kiểm vài chỉ dấu bề mặt (độ dài câu), không thể bảo đảm đúng CEFR.

const (
	DifficultyEasy   = "easy"
	DifficultyMedium = "medium"
	DifficultyHard   = "hard"
)

type DifficultyLevel struct {
	Key    string `json:"key"`
	NameVi string `json:"name_vi"`
	CEFR   string `json:"cefr"`
	// maxAvgWords là ngưỡng cảnh báo độ dài câu trung bình cho mức này.
	maxAvgWords int
}

var DifficultyLevels = []DifficultyLevel{
	{Key: DifficultyEasy, NameVi: "Dễ", CEFR: "A1 / A2", maxAvgWords: 14},
	{Key: DifficultyMedium, NameVi: "Trung bình", CEFR: "B1 / B2", maxAvgWords: 20},
	{Key: DifficultyHard, NameVi: "Khó", CEFR: "B2+ / C1", maxAvgWords: 28},
}

// NormalizeDifficulty trả về mức hợp lệ, mặc định "medium".
func NormalizeDifficulty(key string) string {
	k := strings.ToLower(strings.TrimSpace(key))
	for _, d := range DifficultyLevels {
		if d.Key == k {
			return k
		}
	}
	return DifficultyMedium
}

func difficultyByKey(key string) DifficultyLevel {
	k := NormalizeDifficulty(key)
	for _, d := range DifficultyLevels {
		if d.Key == k {
			return d
		}
	}
	return DifficultyLevels[1]
}

// cefrTarget ghép mức CEFR tham chiếu của phần thi với lựa chọn của giáo viên.
// Mức của phần thi là mốc; nút độ khó dịch quanh mốc đó, nên prompt nói rõ cả
// hai để model không bỏ qua ràng buộc dạng bài.
func cefrTarget(part ExamPart, difficulty string) string {
	d := difficultyByKey(difficulty)
	if part.CEFR == "" {
		return d.CEFR
	}
	switch d.Key {
	case DifficultyEasy:
		return part.CEFR + " nhưng nghiêng về phía dễ (" + d.CEFR + ")"
	case DifficultyHard:
		return part.CEFR + " nhưng nghiêng về phía khó (" + d.CEFR + ")"
	default:
		return part.CEFR
	}
}

// difficultyPrompt là đoạn chỉ dẫn độ khó chèn vào system prompt.
func difficultyPrompt(part ExamPart, difficulty string) string {
	d := difficultyByKey(difficulty)
	return "Target difficulty: CEFR " + cefrTarget(part, difficulty) +
		". Keep average sentence length at or below about " +
		strconv.Itoa(d.maxAvgWords) + " words."
}

// checkDifficulty là kiểm tra bề mặt phía code: câu quá dài so với mức đã chọn
// thì cảnh báo, không tự sửa. Trả về danh sách cảnh báo (có thể rỗng).
func checkDifficulty(text, difficulty string) []string {
	d := difficultyByKey(difficulty)
	sentences := splitSentences(text)
	if len(sentences) == 0 {
		return nil
	}
	words := 0
	for _, s := range sentences {
		words += len(strings.Fields(s))
	}
	avg := words / len(sentences)
	if avg > d.maxAvgWords+6 {
		return []string{"Câu trung bình " + strconv.Itoa(avg) + " từ, dài hơn mức \"" +
			d.NameVi + "\" (" + d.CEFR + ") — cân nhắc chọn lại độ khó hoặc sửa tay."}
	}
	return nil
}

func splitSentences(text string) []string {
	var out []string
	cur := strings.Builder{}
	for _, r := range text {
		cur.WriteRune(r)
		if r == '.' || r == '!' || r == '?' {
			s := strings.TrimSpace(cur.String())
			if len(strings.Fields(s)) > 2 {
				out = append(out, s)
			}
			cur.Reset()
		}
	}
	if s := strings.TrimSpace(cur.String()); len(strings.Fields(s)) > 2 {
		out = append(out, s)
	}
	return out
}
