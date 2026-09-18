package pipelines

// Module 6 — Sơ đồ tư duy mầm non (spec mục 2e).
//
// Giáo viên mầm non lên kế hoạch theo chủ đề bằng hai loại sơ đồ quen thuộc:
//   - "Mạng nội dung": chủ đề → nhánh nội dung → ý nhỏ.
//   - "Mạng hoạt động": chủ đề → các lĩnh vực phát triển → hoạt động cụ thể.
//
// Model chỉ trả NỘI DUNG. Khung cây, thứ tự lĩnh vực, id của nút, giới hạn số
// nhánh / độ dài chữ đều do CODE dựng — không để model tự đặt tên lĩnh vực
// (dễ lệch tên so với Chương trình GDMN) hay tự sinh cây sâu tuỳ ý.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Loại sơ đồ.
const (
	MindmapContent  = "noi_dung"
	MindmapActivity = "hoat_dong"
)

// Giới hạn cây do code áp.
const (
	mindMaxBranches     = 6   // nhánh cấp 1 của mạng nội dung
	mindMaxChildren     = 6   // nút con mỗi nhánh
	mindMaxDetails      = 5   // ý nhỏ mỗi nút cấp 2
	mindMaxTextRunes    = 120 // độ dài chữ mỗi nút do AI sinh
	mindEditMaxRunes    = 200 // độ dài chữ khi giáo viên tự sửa
	mindEditMaxDepth    = 6
	mindEditMaxNodes    = 400
	mindMinWeeks        = 1
	mindMaxWeeks        = 6
	mindDefaultWeeks    = 2
	mindTopicMaxRunes   = 100
	mindNotesMaxRunes   = 1000
	mindDefaultAgeGroup = "mg_nho"
)

// MetaOption là một lựa chọn hiển thị ở frontend (nhóm tuổi, loại sơ đồ, lĩnh vực).
type MetaOption struct {
	Key    string `json:"key"`
	NameVi string `json:"name_vi"`
	Hint   string `json:"hint,omitempty"`
}

// MindmapTypes — hai loại sơ đồ.
var MindmapTypes = []MetaOption{
	{Key: MindmapContent, NameVi: "Mạng nội dung",
		Hint: "Chủ đề → các nhánh nội dung trẻ được tìm hiểu → ý nhỏ."},
	{Key: MindmapActivity, NameVi: "Mạng hoạt động",
		Hint: "Chủ đề → các lĩnh vực phát triển → hoạt động cụ thể cho từng lĩnh vực."},
}

// AgeGroups — nhóm/lớp theo Chương trình Giáo dục mầm non.
var AgeGroups = []MetaOption{
	{Key: "nha_tre", NameVi: "Nhà trẻ (24–36 tháng)"},
	{Key: "mg_be", NameVi: "Mẫu giáo bé (3–4 tuổi)"},
	{Key: "mg_nho", NameVi: "Mẫu giáo nhỡ (4–5 tuổi)"},
	{Key: "mg_lon", NameVi: "Mẫu giáo lớn (5–6 tuổi)"},
}

// Lĩnh vực phát triển. Mẫu giáo có 5 lĩnh vực; nhà trẻ gộp tình cảm – kỹ năng
// xã hội với thẩm mỹ thành 1, còn 4 lĩnh vực.
var domainsMauGiao = []MetaOption{
	{Key: "the_chat", NameVi: "Phát triển thể chất"},
	{Key: "nhan_thuc", NameVi: "Phát triển nhận thức"},
	{Key: "ngon_ngu", NameVi: "Phát triển ngôn ngữ"},
	{Key: "tinh_cam_xa_hoi", NameVi: "Phát triển tình cảm và kỹ năng xã hội"},
	{Key: "tham_my", NameVi: "Phát triển thẩm mỹ"},
}

var domainsNhaTre = []MetaOption{
	{Key: "the_chat", NameVi: "Phát triển thể chất"},
	{Key: "nhan_thuc", NameVi: "Phát triển nhận thức"},
	{Key: "ngon_ngu", NameVi: "Phát triển ngôn ngữ"},
	{Key: "tinh_cam_xa_hoi_tham_my", NameVi: "Phát triển tình cảm, kỹ năng xã hội và thẩm mỹ"},
}

// DomainsFor trả danh sách lĩnh vực đúng thứ tự cho nhóm tuổi.
func DomainsFor(ageGroup string) []MetaOption {
	if ageGroup == "nha_tre" {
		return domainsNhaTre
	}
	return domainsMauGiao
}

func optionName(list []MetaOption, key string) (string, bool) {
	for _, o := range list {
		if o.Key == key {
			return o.NameVi, true
		}
	}
	return "", false
}

// MindmapInput là input của job mindmap.
type MindmapInput struct {
	Topic      string `json:"topic"`
	MapType    string `json:"map_type"`
	AgeGroup   string `json:"age_group"`
	Weeks      int    `json:"weeks"`
	Notes      string `json:"notes"`
	GradeLevel string `json:"grade_level"`
}

// MindNode là một nút của sơ đồ. Cùng một hình dạng cho kết quả AI và cho
// bản giáo viên đã sửa — frontend chỉ cần hiểu một kiểu cây.
type MindNode struct {
	ID       string      `json:"id"`
	Text     string      `json:"text"`
	Tag      string      `json:"tag,omitempty"` // nhãn phụ, vd hình thức tổ chức hoạt động
	Children []*MindNode `json:"children,omitempty"`
}

// ---------- Schema & prompt ----------

func mindContentSchema() map[string]any {
	str := map[string]any{"type": "string"}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"branches": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title": str,
						"points": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"title":   str,
									"details": map[string]any{"type": "array", "items": str},
								},
								"required": []string{"title", "details"},
							},
						},
					},
					"required": []string{"title", "points"},
				},
			},
		},
		"required": []string{"branches"},
	}
}

func mindActivitySchema(domains []MetaOption) map[string]any {
	keys := make([]string, len(domains))
	for i, d := range domains {
		keys[i] = d.Key
	}
	str := map[string]any{"type": "string"}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"domains": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"domain_key": map[string]any{"type": "string", "enum": keys},
						"activities": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"name":    str,
									"form":    str,
									"details": map[string]any{"type": "array", "items": str},
								},
								"required": []string{"name", "form", "details"},
							},
						},
					},
					"required": []string{"domain_key", "activities"},
				},
			},
		},
		"required": []string{"domains"},
	}
}

const mindSystemCommon = `Bạn là giáo viên mầm non giàu kinh nghiệm tại Việt Nam, am hiểu Chương trình Giáo dục mầm non của Bộ GD&ĐT.
Bạn giúp đồng nghiệp lập sơ đồ tư duy cho chủ đề/sự kiện của lớp %s, thực hiện trong %d tuần.
Yêu cầu chung:
- Viết tiếng Việt, câu ngắn gọn (mỗi ý tối đa khoảng 12 từ), phù hợp lứa tuổi, an toàn cho trẻ.
- Nội dung gần gũi, trẻ trải nghiệm được bằng giác quan, không hàn lâm.
- Không đánh số, không thêm ký hiệu đầu dòng vào chữ.`

const mindContentRules = `
Loại sơ đồ: MẠNG NỘI DUNG.
- branches: 4–5 nhánh nội dung lớn của chủ đề (vd với chủ đề "Gia đình": "Gia đình của bé", "Nhu cầu gia đình", "Ngôi nhà của bé", "Đồ dùng gia đình").
- Mỗi nhánh có 2–4 points là các ý nội dung trẻ tìm hiểu.
- Mỗi point có 0–3 details là ý nhỏ cụ thể (có thể để rỗng).`

const mindActivityRules = `
Loại sơ đồ: MẠNG HOẠT ĐỘNG theo các lĩnh vực phát triển:
%s
- domains: mỗi lĩnh vực trên đúng 1 phần tử, domain_key lấy đúng mã đã cho.
- Mỗi lĩnh vực 2–4 activities, gắn với chủ đề.
- name: tên hoạt động cụ thể (vd "Bật xa 35cm", "Thơ: Thương mẹ", "Vẽ chân dung người thân").
- form: hình thức tổ chức ngắn, vd "Hoạt động học", "Hoạt động góc", "Hoạt động ngoài trời", "Hoạt động chiều", "Trò chơi".
- details: 0–2 ý ngắn về mục tiêu hoặc cách tổ chức (có thể để rỗng).`

const mindUserPrompt = `Chủ đề: %s
%s
Hãy lập sơ đồ theo đúng yêu cầu.`

// ---------- Pipeline ----------

func runMindmap(client ollamaChatter, model string, input json.RawMessage) (*Result, error) {
	var in MindmapInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input sơ đồ tư duy không hợp lệ: %w", err)
	}
	in.Topic = strings.TrimSpace(in.Topic)
	if in.Topic == "" {
		return nil, fmt.Errorf("cần nhập chủ đề cho sơ đồ tư duy")
	}
	if utf8.RuneCountInString(in.Topic) > mindTopicMaxRunes {
		return nil, fmt.Errorf("chủ đề quá dài (tối đa %d ký tự)", mindTopicMaxRunes)
	}
	var warnings []string
	if in.MapType != MindmapActivity && in.MapType != MindmapContent {
		if in.MapType != "" {
			warnings = append(warnings, fmt.Sprintf("Loại sơ đồ %q không hỗ trợ — đã dùng Mạng nội dung", in.MapType))
		}
		in.MapType = MindmapContent
	}
	ageName, ok := optionName(AgeGroups, in.AgeGroup)
	if !ok {
		in.AgeGroup = mindDefaultAgeGroup
		ageName, _ = optionName(AgeGroups, in.AgeGroup)
	}
	if in.Weeks == 0 {
		in.Weeks = mindDefaultWeeks
	}
	if in.Weeks < mindMinWeeks || in.Weeks > mindMaxWeeks {
		warnings = append(warnings, fmt.Sprintf("Số tuần %d ngoài khoảng %d–%d — đã đưa về khoảng", in.Weeks, mindMinWeeks, mindMaxWeeks))
		in.Weeks = clampInt(in.Weeks, mindMinWeeks, mindMaxWeeks)
	}
	notes := truncRunes(strings.TrimSpace(in.Notes), mindNotesMaxRunes)
	notesLine := ""
	if notes != "" {
		notesLine = "Ghi chú của giáo viên (ưu tiên làm theo): " + notes
	}

	system := fmt.Sprintf(mindSystemCommon, ageName, in.Weeks)
	user := fmt.Sprintf(mindUserPrompt, in.Topic, notesLine)

	var root *MindNode
	var w []string
	if in.MapType == MindmapActivity {
		domains := DomainsFor(in.AgeGroup)
		var lines []string
		for _, d := range domains {
			lines = append(lines, fmt.Sprintf("  - %s: %s", d.Key, d.NameVi))
		}
		system += fmt.Sprintf(mindActivityRules, strings.Join(lines, "\n"))
		raw, err := client.ChatStructured(model, system, user, mindActivitySchema(domains))
		if err != nil {
			return nil, err
		}
		root, w, err = buildActivityTree(in.Topic, domains, raw)
		if err != nil {
			return nil, err
		}
	} else {
		system += mindContentRules
		raw, err := client.ChatStructured(model, system, user, mindContentSchema())
		if err != nil {
			return nil, err
		}
		root, w, err = buildContentTree(in.Topic, raw)
		if err != nil {
			return nil, err
		}
	}
	warnings = append(warnings, w...)
	AssignMindIDs(root)

	typeName, _ := optionName(MindmapTypes, in.MapType)
	c, err := toContent(map[string]any{
		"map_type":       in.MapType,
		"map_type_name":  typeName,
		"topic":          in.Topic,
		"age_group":      in.AgeGroup,
		"age_group_name": ageName,
		"weeks":          in.Weeks,
		"root":           root,
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    fmt.Sprintf("%s — %s", typeName, in.Topic),
		Content:  c,
		Warnings: warnings,
	}, nil
}

// buildContentTree dựng cây "mạng nội dung" từ JSON model trả về.
func buildContentTree(topic, raw string) (*MindNode, []string, error) {
	var res struct {
		Branches []struct {
			Title  string `json:"title"`
			Points []struct {
				Title   string   `json:"title"`
				Details []string `json:"details"`
			} `json:"points"`
		} `json:"branches"`
	}
	if err := json.Unmarshal([]byte(raw), &res); err != nil {
		return nil, nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}
	var warnings []string
	root := &MindNode{Text: topic}
	seen := map[string]bool{}
	for _, b := range res.Branches {
		title, cut := cleanMindText(b.Title, mindMaxTextRunes)
		if title == "" || seen[strings.ToLower(title)] {
			continue
		}
		seen[strings.ToLower(title)] = true
		if cut {
			warnings = append(warnings, fmt.Sprintf("Nhánh %q quá dài — đã cắt bớt", title))
		}
		branch := &MindNode{Text: title}
		seenP := map[string]bool{}
		for _, p := range b.Points {
			pt, _ := cleanMindText(p.Title, mindMaxTextRunes)
			if pt == "" || seenP[strings.ToLower(pt)] {
				continue
			}
			seenP[strings.ToLower(pt)] = true
			node := &MindNode{Text: pt}
			node.Children = detailNodes(p.Details, mindMaxDetails)
			branch.Children = append(branch.Children, node)
		}
		if len(branch.Children) > mindMaxChildren {
			warnings = append(warnings, fmt.Sprintf("Nhánh %q có %d ý — chỉ giữ %d", title, len(branch.Children), mindMaxChildren))
			branch.Children = branch.Children[:mindMaxChildren]
		}
		if len(branch.Children) == 0 {
			warnings = append(warnings, fmt.Sprintf("Nhánh %q chưa có ý nội dung nào — giáo viên bổ sung", title))
		}
		root.Children = append(root.Children, branch)
	}
	if len(root.Children) == 0 {
		return nil, nil, fmt.Errorf("model không trả về nhánh nội dung nào — thử lại hoặc đổi model")
	}
	if len(root.Children) > mindMaxBranches {
		warnings = append(warnings, fmt.Sprintf("Model trả %d nhánh — chỉ giữ %d nhánh đầu", len(root.Children), mindMaxBranches))
		root.Children = root.Children[:mindMaxBranches]
	}
	if len(root.Children) < 3 {
		warnings = append(warnings, fmt.Sprintf("Sơ đồ chỉ có %d nhánh nội dung — nên bổ sung", len(root.Children)))
	}
	return root, warnings, nil
}

// buildActivityTree dựng cây "mạng hoạt động". Nhánh cấp 1 LUÔN là đủ các lĩnh
// vực theo đúng thứ tự và tên chuẩn, bất kể model trả thiếu, thừa hay lộn thứ tự.
func buildActivityTree(topic string, domains []MetaOption, raw string) (*MindNode, []string, error) {
	var res struct {
		Domains []struct {
			DomainKey  string `json:"domain_key"`
			Activities []struct {
				Name    string   `json:"name"`
				Form    string   `json:"form"`
				Details []string `json:"details"`
			} `json:"activities"`
		} `json:"domains"`
	}
	if err := json.Unmarshal([]byte(raw), &res); err != nil {
		return nil, nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}
	var warnings []string
	byKey := map[string]*MindNode{}
	seenAct := map[string]map[string]bool{}
	for _, d := range domains {
		byKey[d.Key] = &MindNode{Text: d.NameVi}
		seenAct[d.Key] = map[string]bool{}
	}
	total := 0
	for _, d := range res.Domains {
		branch, ok := byKey[d.DomainKey]
		if !ok {
			warnings = append(warnings, fmt.Sprintf("Bỏ lĩnh vực lạ %q do model trả về", d.DomainKey))
			continue
		}
		for _, a := range d.Activities {
			name, _ := cleanMindText(a.Name, mindMaxTextRunes)
			if name == "" || seenAct[d.DomainKey][strings.ToLower(name)] {
				continue
			}
			seenAct[d.DomainKey][strings.ToLower(name)] = true
			form, _ := cleanMindText(a.Form, 40)
			branch.Children = append(branch.Children, &MindNode{
				Text:     name,
				Tag:      form,
				Children: detailNodes(a.Details, 3),
			})
			total++
		}
	}
	root := &MindNode{Text: topic}
	for _, d := range domains {
		branch := byKey[d.Key]
		if len(branch.Children) > mindMaxChildren {
			warnings = append(warnings, fmt.Sprintf("%s có %d hoạt động — chỉ giữ %d", d.NameVi, len(branch.Children), mindMaxChildren))
			branch.Children = branch.Children[:mindMaxChildren]
		}
		if len(branch.Children) == 0 {
			warnings = append(warnings, fmt.Sprintf("%s chưa có hoạt động nào — giáo viên bổ sung", d.NameVi))
		}
		root.Children = append(root.Children, branch)
	}
	if total == 0 {
		return nil, nil, fmt.Errorf("model không trả về hoạt động nào — thử lại hoặc đổi model")
	}
	return root, warnings, nil
}

func detailNodes(details []string, max int) []*MindNode {
	var out []*MindNode
	seen := map[string]bool{}
	for _, s := range details {
		t, _ := cleanMindText(s, mindMaxTextRunes)
		if t == "" || seen[strings.ToLower(t)] {
			continue
		}
		seen[strings.ToLower(t)] = true
		out = append(out, &MindNode{Text: t})
		if len(out) == max {
			break
		}
	}
	return out
}

// numberPrefixRe bắt số thứ tự model hay tự thêm: "1. ", "2) ".
var numberPrefixRe = regexp.MustCompile(`^\d{1,2}[\.\)]\s+`)

// mindNodeIDRe accepts the IDs produced by both the legacy backend (n1) and
// the editor (for example c17897150000001), while keeping stored references
// compact and safe to compare across requests.
var mindNodeIDRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,127}$`)

// cleanMindText gọt chữ của một nút: bỏ ký hiệu đầu dòng/đánh số model hay
// thêm, gộp khoảng trắng, cắt theo rune. Trả thêm cờ đã cắt.
func cleanMindText(s string, max int) (string, bool) {
	s = strings.Join(strings.Fields(s), " ")
	s = strings.TrimLeft(s, "-•*+–— ")
	s = numberPrefixRe.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		return truncRunes(s, max), true
	}
	return s, false
}

func truncRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:max-1])) + "…"
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// AssignMindIDs đặt lại id tuần tự n0, n1, … theo thứ tự duyệt sâu.
func AssignMindIDs(root *MindNode) {
	n := 0
	var walk func(*MindNode)
	walk = func(node *MindNode) {
		node.ID = fmt.Sprintf("n%d", n)
		n++
		for _, c := range node.Children {
			walk(c)
		}
	}
	if root != nil {
		walk(root)
	}
}

// NormalizeEditedMindTree kiểm và gọt cây giáo viên gửi lên khi lưu bản đã
// sửa. Backend không tin frontend: giới hạn độ sâu, tổng số nút, độ dài chữ;
// bỏ nút rỗng (trừ gốc). ID hợp lệ và duy nhất được giữ để các dữ liệu gắn
// với nút không bị lệch khi đổi thứ tự; ID thiếu/hỏng/trùng được sinh lại.
func NormalizeEditedMindTree(root *MindNode) (*MindNode, error) {
	if root == nil {
		return nil, fmt.Errorf("sơ đồ rỗng")
	}
	idCounts := make(map[string]int)
	type nodeDepth struct {
		node  *MindNode
		depth int
	}
	stack := []nodeDepth{{node: root}}
	preCount := 0
	for len(stack) > 0 {
		item := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if item.node == nil {
			continue
		}
		text, _ := cleanMindText(item.node.Text, mindEditMaxRunes)
		if text == "" && item.depth > 0 {
			continue
		}
		preCount++
		if preCount > mindEditMaxNodes {
			return nil, fmt.Errorf("sơ đồ quá lớn: tối đa %d nút", mindEditMaxNodes)
		}
		if item.depth >= mindEditMaxDepth && len(item.node.Children) > 0 {
			return nil, fmt.Errorf("sơ đồ quá sâu: tối đa %d tầng", mindEditMaxDepth)
		}
		if mindNodeIDRe.MatchString(item.node.ID) {
			idCounts[item.node.ID]++
		}
		for _, child := range item.node.Children {
			stack = append(stack, nodeDepth{node: child, depth: item.depth + 1})
		}
	}

	reserved := make(map[string]bool)
	blocked := make(map[string]bool)
	for id, occurrences := range idCounts {
		blocked[id] = true
		if occurrences == 1 {
			reserved[id] = true
		}
	}
	used := make(map[string]bool)
	assignID := func(candidate string) (string, error) {
		if reserved[candidate] && !used[candidate] {
			used[candidate] = true
			return candidate, nil
		}
		for attempt := 0; attempt < 16; attempt++ {
			random := make([]byte, 16)
			if _, err := rand.Read(random); err != nil {
				return "", fmt.Errorf("không sinh được ID nút: %w", err)
			}
			id := "c" + hex.EncodeToString(random)
			if !blocked[id] && !used[id] {
				used[id] = true
				return id, nil
			}
		}
		return "", fmt.Errorf("không sinh được ID nút duy nhất")
	}

	count := 0
	var walk func(node *MindNode, depth int) (*MindNode, error)
	walk = func(node *MindNode, depth int) (*MindNode, error) {
		text, _ := cleanMindText(node.Text, mindEditMaxRunes)
		if text == "" && depth > 0 {
			return nil, nil
		}
		count++
		if count > mindEditMaxNodes {
			return nil, fmt.Errorf("sơ đồ quá lớn: tối đa %d nút", mindEditMaxNodes)
		}
		tag, _ := cleanMindText(node.Tag, 40)
		id, err := assignID(node.ID)
		if err != nil {
			return nil, err
		}
		out := &MindNode{ID: id, Text: text, Tag: tag}
		if depth >= mindEditMaxDepth && len(node.Children) > 0 {
			return nil, fmt.Errorf("sơ đồ quá sâu: tối đa %d tầng", mindEditMaxDepth)
		}
		for _, c := range node.Children {
			if c == nil {
				continue
			}
			nc, err := walk(c, depth+1)
			if err != nil {
				return nil, err
			}
			if nc != nil {
				out.Children = append(out.Children, nc)
			}
		}
		return out, nil
	}
	out, err := walk(root, 0)
	if err != nil {
		return nil, err
	}
	if out.Text == "" {
		return nil, fmt.Errorf("nút trung tâm không được để trống")
	}
	return out, nil
}
