package handlers

import "testing"

func TestToFormBlocksFromExamContent(t *testing.T) {
	raw := []byte(`{"parts":[
		{"part_name":"Phần 1","instruction":"Read...","passage":"A (1)_____ b.","items":[
			{"exam_number":1,"options":["a","b","c","d"],"answer_index":2,"explanation":"vì vậy"}]},
		{"part_name":"Phần 2","instruction":"Read...","passage":"P","items":[
			{"exam_number":2,"prompt":"What?","options":["w","x","y","z"],"answer_index":0}]}]}`)
	blocks, total := toFormBlocks(raw)
	if total != 2 {
		t.Fatalf("đếm sai số câu: %d", total)
	}
	if len(blocks) != 2 {
		t.Fatalf("cần 2 khối, có %d", len(blocks))
	}
	if blocks[0].Passage == "" || blocks[0].Heading != "Phần 1" {
		t.Fatalf("khối 1 mất đoạn văn hoặc tiêu đề: %+v", blocks[0])
	}
	if blocks[0].Questions[0].AnswerIndex != 2 {
		t.Fatalf("mất chỉ số đáp án")
	}
	if blocks[1].Questions[0].Number != 2 {
		t.Fatalf("số câu phải lấy từ exam_number")
	}
}

func TestToFormBlocksFromQuizContent(t *testing.T) {
	raw := []byte(`{"questions":[
		{"question":"Q1?","options":["a","b","c","d"],"answer_index":1,"explanation":"e"},
		{"question":"Q2?","options":["a","b","c","d"],"answer_index":3}]}`)
	blocks, total := toFormBlocks(raw)
	if total != 2 || len(blocks) != 1 {
		t.Fatalf("quiz phải ra 1 khối 2 câu, có %d khối %d câu", len(blocks), total)
	}
	if blocks[0].Questions[1].Number != 2 {
		t.Fatalf("quiz phải tự đánh số 1..n")
	}
}

func TestToFormBlocksEmptyContent(t *testing.T) {
	if _, total := toFormBlocks([]byte(`{"warnings":[]}`)); total != 0 {
		t.Fatalf("content rỗng phải ra 0 câu")
	}
	if _, total := toFormBlocks([]byte(`khong phai json`)); total != 0 {
		t.Fatalf("content hỏng phải ra 0 câu, không panic")
	}
}
