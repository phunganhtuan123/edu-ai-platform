package pipelines

import (
	"encoding/json"
	"strings"
	"testing"
)

// mindFake trả JSON cố định theo loại sơ đồ, ghi lại prompt để kiểm.
type mindFake struct {
	system string
	reply  string
}

func (f *mindFake) ChatStructured(model, system, user string, schema map[string]any) (string, error) {
	f.system = system
	if f.reply != "" {
		return f.reply, nil
	}
	props, _ := schema["properties"].(map[string]any)
	if _, ok := props["domains"]; ok {
		// Thiếu "tham_my", lộn thứ tự, có lĩnh vực lạ, có hoạt động trùng.
		return `{"domains":[
			{"domain_key":"ngon_ngu","activities":[{"name":"Thơ: Thương mẹ","form":"Hoạt động học","details":["Trẻ đọc thuộc thơ"]}]},
			{"domain_key":"the_chat","activities":[
				{"name":"1. Bật xa 35cm","form":"Hoạt động học","details":[]},
				{"name":"bật xa 35cm","form":"Trò chơi","details":[]}]},
			{"domain_key":"toan_hoc","activities":[{"name":"Đếm đến 5","form":"Hoạt động học","details":[]}]},
			{"domain_key":"nhan_thuc","activities":[{"name":"Tìm hiểu gia đình bé","form":"Hoạt động học","details":[]}]},
			{"domain_key":"tinh_cam_xa_hoi","activities":[{"name":"Góc gia đình: nấu ăn","form":"Hoạt động góc","details":[]}]}
		]}`, nil
	}
	return `{"branches":[
		{"title":"- Gia đình của bé","points":[{"title":"Các thành viên","details":["Bố","Mẹ","bố"]},{"title":"Công việc của người thân","details":[]}]},
		{"title":"Ngôi nhà của bé","points":[{"title":"Các phòng trong nhà","details":[]}]},
		{"title":"gia đình của bé","points":[]},
		{"title":"Đồ dùng gia đình","points":[]}
	]}`, nil
}

func TestMindmapActivityAlwaysHasAllDomainsInOrder(t *testing.T) {
	in := json.RawMessage(`{"topic":"Gia đình","map_type":"hoat_dong","age_group":"mg_be","weeks":3}`)
	res, err := runMindmap(&mindFake{}, "m", in)
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	root := res.Content["root"].(map[string]any)
	branches := root["children"].([]any)
	if len(branches) != 5 {
		t.Fatalf("mẫu giáo phải đủ 5 lĩnh vực, có %d", len(branches))
	}
	for i, d := range domainsMauGiao {
		if got := branches[i].(map[string]any)["text"]; got != d.NameVi {
			t.Fatalf("nhánh %d = %v, cần %q", i, got, d.NameVi)
		}
	}
	thechat := branches[0].(map[string]any)["children"].([]any)
	if len(thechat) != 1 {
		t.Fatalf("hoạt động trùng phải bị gộp, còn %d", len(thechat))
	}
	first := thechat[0].(map[string]any)
	if first["text"] != "Bật xa 35cm" || first["tag"] != "Hoạt động học" {
		t.Fatalf("phải bỏ số thứ tự và giữ hình thức: %v", first)
	}
	joined := strings.Join(res.Warnings, "|")
	if !strings.Contains(joined, "toan_hoc") || !strings.Contains(joined, "Phát triển thẩm mỹ") {
		t.Fatalf("cần cảnh báo lĩnh vực lạ và lĩnh vực thiếu, có: %v", res.Warnings)
	}
	if root["id"] != "n0" {
		t.Fatalf("gốc phải có id n0, có %v", root["id"])
	}
}

func TestMindmapNhaTreUsesFourDomains(t *testing.T) {
	f := &mindFake{}
	in := json.RawMessage(`{"topic":"Gia đình","map_type":"hoat_dong","age_group":"nha_tre"}`)
	res, err := runMindmap(f, "m", in)
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	branches := res.Content["root"].(map[string]any)["children"].([]any)
	if len(branches) != 4 {
		t.Fatalf("nhà trẻ phải có 4 lĩnh vực, có %d", len(branches))
	}
	if !strings.Contains(f.system, "Nhà trẻ") || !strings.Contains(f.system, "2 tuần") {
		t.Fatalf("prompt phải có nhóm tuổi và số tuần mặc định: %s", f.system)
	}
}

func TestMindmapContentDedupesAndWarns(t *testing.T) {
	in := json.RawMessage(`{"topic":"Gia đình","map_type":"noi_dung","weeks":99}`)
	res, err := runMindmap(&mindFake{}, "m", in)
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	branches := res.Content["root"].(map[string]any)["children"].([]any)
	if len(branches) != 3 {
		t.Fatalf("nhánh trùng (khác hoa thường) phải bị bỏ, còn %d", len(branches))
	}
	b0 := branches[0].(map[string]any)
	if b0["text"] != "Gia đình của bé" {
		t.Fatalf("phải bỏ gạch đầu dòng: %v", b0["text"])
	}
	details := b0["children"].([]any)[0].(map[string]any)["children"].([]any)
	if len(details) != 2 {
		t.Fatalf("ý nhỏ trùng phải bị bỏ, còn %d", len(details))
	}
	if res.Content["weeks"].(float64) != 6 {
		t.Fatalf("số tuần phải bị kẹp về 6, có %v", res.Content["weeks"])
	}
	joined := strings.Join(res.Warnings, "|")
	if !strings.Contains(joined, "Số tuần") || !strings.Contains(joined, "Đồ dùng gia đình") {
		t.Fatalf("thiếu cảnh báo: %v", res.Warnings)
	}
}

func TestMindmapRejectsEmptyTopicAndEmptyModelOutput(t *testing.T) {
	if _, err := runMindmap(&mindFake{}, "m", json.RawMessage(`{"topic":"  "}`)); err == nil {
		t.Fatalf("chủ đề rỗng phải bị chặn")
	}
	_, err := runMindmap(&mindFake{reply: `{"branches":[]}`}, "m", json.RawMessage(`{"topic":"Nước"}`))
	if err == nil || !strings.Contains(err.Error(), "không trả về") {
		t.Fatalf("model trả rỗng phải báo lỗi rõ, có: %v", err)
	}
}

func TestNormalizeEditedMindTree(t *testing.T) {
	root := &MindNode{ID: "n9", Text: "  Gia   đình ", Children: []*MindNode{
		{ID: "c17897150000001", Text: "Nhánh 1", Children: []*MindNode{{ID: "n8", Text: "   "}, {ID: "n2", Text: "Ý con"}}},
		nil,
		{ID: "n7", Text: ""},
	}}
	out, err := NormalizeEditedMindTree(root)
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	if out.Text != "Gia đình" || len(out.Children) != 1 || len(out.Children[0].Children) != 1 {
		t.Fatalf("chưa gọt đúng: %+v", out)
	}
	if out.ID != "n9" || out.Children[0].ID != "c17897150000001" || out.Children[0].Children[0].ID != "n2" {
		t.Fatalf("id hợp lệ duy nhất phải được giữ nguyên: %+v", out)
	}
	if _, err := NormalizeEditedMindTree(&MindNode{Text: " "}); err == nil {
		t.Fatalf("gốc rỗng phải bị chặn")
	}
	deep := &MindNode{Text: "g"}
	cur := deep
	for i := 0; i < 10; i++ {
		n := &MindNode{Text: "x"}
		cur.Children = []*MindNode{n}
		cur = n
	}
	if _, err := NormalizeEditedMindTree(deep); err == nil {
		t.Fatalf("cây quá sâu phải bị chặn")
	}
}

func TestNormalizeEditedMindTreeGeneratesCollisionFreeIDs(t *testing.T) {
	root := &MindNode{ID: "n0", Text: "Gốc", Children: []*MindNode{
		{ID: "n1", Text: "Giữ n1"},
		{ID: "n1", Text: "Trùng n1"},
		{ID: "", Text: "Thiếu ID"},
		{ID: "bad id", Text: "ID không hợp lệ"},
		{ID: "n3", Text: "Giữ n3"},
	}}
	out, err := NormalizeEditedMindTree(root)
	if err != nil {
		t.Fatalf("lỗi: %v", err)
	}
	ids := map[string]bool{}
	var walk func(*MindNode)
	walk = func(node *MindNode) {
		if ids[node.ID] {
			t.Fatalf("ID bị trùng sau normalize: %q", node.ID)
		}
		ids[node.ID] = true
		for _, child := range node.Children {
			walk(child)
		}
	}
	walk(out)
	if out.ID != "n0" || out.Children[4].ID != "n3" {
		t.Fatalf("ID hợp lệ duy nhất phải được giữ: %+v", out)
	}
	if out.Children[0].ID == "n1" || out.Children[1].ID == "n1" {
		t.Fatalf("ID trùng đầu vào phải được sinh lại cho cả hai nút: %+v", out.Children)
	}
	for _, child := range out.Children[:4] {
		if !strings.HasPrefix(child.ID, "c") {
			t.Fatalf("ID backend sinh mới phải dùng không gian c ngẫu nhiên để tránh trùng attachment orphan: %q", child.ID)
		}
	}
	for id := range ids {
		if len(id) > 128 {
			t.Fatalf("ID sinh ra vượt giới hạn: %q", id)
		}
	}
}

func TestNormalizeEditedMindTreeRejectsOverlongIDByReplacingIt(t *testing.T) {
	root := &MindNode{ID: strings.Repeat("c", 129), Text: "Gốc"}
	out, err := NormalizeEditedMindTree(root)
	if err != nil {
		t.Fatalf("ID hỏng phải được thay thay vì làm mất cây: %v", err)
	}
	if out.ID == root.ID || out.ID == "" || len(out.ID) > 128 {
		t.Fatalf("ID thay thế không hợp lệ: %q", out.ID)
	}
}
