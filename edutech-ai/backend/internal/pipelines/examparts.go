package pipelines

// Bảng phần thi THPT — nguồn sự thật duy nhất của dự án (spec mục 2a).
//
// Mã phần (ID) dùng xuyên suốt DB, API và UI. KHÔNG đánh số lại ở bất kỳ đâu.
// Lý do: EdTech Corner có hai app cùng nội dung nhưng đánh số phần lệch nhau
// (bản Việt Phần II = "Điền từ", bản Anh Part 2 = "Reading Comprehension").
// Ở đây chỉ có một bảng, và frontend đọc nó qua GET /api/meta/exam-parts.

// PartKind là bản chất bài của một phần thi. Mỗi kind có một generator riêng
// trong exam.go; thêm phần mới = thêm một dòng vào ExamParts, không đụng
// pipeline chung.
type PartKind string

const (
	KindCloze    PartKind = "cloze"    // đoạn văn có chỗ trống đánh số, chọn từ điền
	KindOrdering PartKind = "ordering" // sắp xếp câu thành đoạn mạch lạc
	KindReading  PartKind = "reading"  // đọc đoạn + câu hỏi trắc nghiệm
)

type ExamPart struct {
	ID     string   `json:"id"`
	NameVi string   `json:"name_vi"`
	NameEn string   `json:"name_en"`
	Kind   PartKind `json:"kind"`
	// CEFR là mức tham chiếu CỦA PHẦN THI, độc lập với nút chọn độ khó của
	// giáo viên (difficulty.go dịch mức lên/xuống quanh mốc này).
	CEFR         string `json:"cefr"`
	DefaultCount int    `json:"default_count"`
	// CountConfirmed = false nghĩa là số câu MỚI LÀ PHỎNG ĐOÁN, chưa đối chiếu
	// đề minh hoạ Bộ GD&ĐT 2/2025. Frontend phải hiện cảnh báo cho giáo viên.
	CountConfirmed bool   `json:"count_confirmed"`
	Stimulus       string `json:"-"` // loại ngữ liệu đưa vào prompt
	Enabled        bool   `json:"enabled"`
}

// ExamParts — 6 phần theo đề minh hoạ Bộ GD&ĐT 2/2025.
//
// CẢNH BÁO: chỉ p1 và p5 có số câu đã chốt (6). Bốn phần còn lại để
// CountConfirmed=false — phải mở đề minh hoạ thật ra điền, không suy đoán.
var ExamParts = []ExamPart{
	{
		ID: "p1_cloze_notice", NameVi: "Phần 1 — Điền từ (ngữ pháp/từ vựng), ngữ cảnh thông báo",
		NameEn: "Grammar & Vocabulary Cloze", Kind: KindCloze, CEFR: "B1",
		DefaultCount: 6, CountConfirmed: true, Stimulus: "notice", Enabled: true,
	},
	{
		ID: "p2_cloze_lexical", NameVi: "Phần 2 — Điền từ (từ vựng–ngữ pháp)",
		NameEn: "Lexical–Grammatical Cloze", Kind: KindCloze, CEFR: "B1+",
		DefaultCount: 6, CountConfirmed: false, Stimulus: "lexical", Enabled: true,
	},
	{
		ID: "p3_ordering", NameVi: "Phần 3 — Sắp xếp câu",
		NameEn: "Sentence Ordering", Kind: KindOrdering, CEFR: "B1-B2",
		DefaultCount: 4, CountConfirmed: false, Stimulus: "", Enabled: true,
	},
	{
		ID: "p4_gapfill_reading", NameVi: "Phần 4 — Đọc điền khuyết (ngữ pháp)",
		NameEn: "Reading Gap-Fill", Kind: KindCloze, CEFR: "B2",
		DefaultCount: 6, CountConfirmed: false, Stimulus: "reading", Enabled: true,
	},
	{
		ID: "p5_reading_info", NameVi: "Phần 5 — Đọc hiểu thông tin (tờ rơi/quảng cáo)",
		NameEn: "Informational Reading", Kind: KindReading, CEFR: "B1+",
		DefaultCount: 6, CountConfirmed: true, Stimulus: "leaflet", Enabled: true,
	},
	{
		ID: "p6_reading_academic", NameVi: "Phần 6 — Đọc hiểu học thuật",
		NameEn: "Academic Reading", Kind: KindReading, CEFR: "B2",
		DefaultCount: 6, CountConfirmed: false, Stimulus: "academic", Enabled: true,
	},
}

// legacyExamParts giữ tương thích ngược với job đã lưu trước spec 1.2, khi
// input còn là {"section":"notice"|"leaflet"} và tờ rơi là bài ĐIỀN TỪ.
// Không hiện trong catalog, chỉ để job cũ chạy lại ra đúng kết quả cũ.
var legacyExamParts = map[string]ExamPart{
	"notice": ExamParts[0],
	"leaflet": {
		ID: "legacy_cloze_leaflet", NameVi: "Điền từ vào tờ rơi/quảng cáo (bản cũ)",
		NameEn: "Leaflet Cloze (legacy)", Kind: KindCloze, CEFR: "B1",
		DefaultCount: 6, CountConfirmed: true, Stimulus: "leaflet_cloze", Enabled: false,
	},
}

// FindExamPart tra một phần theo mã, kể cả mã cũ.
func FindExamPart(id string) (ExamPart, bool) {
	for _, p := range ExamParts {
		if p.ID == id {
			return p, true
		}
	}
	if p, ok := legacyExamParts[id]; ok {
		return p, true
	}
	for _, p := range legacyExamParts {
		if p.ID == id {
			return p, true
		}
	}
	return ExamPart{}, false
}
