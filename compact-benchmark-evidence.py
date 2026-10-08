"""Extract compact run2_warm coordinate evidence from one local OCR run."""
from __future__ import annotations
import json
import sys
from pathlib import Path

def first_result(node):
    if isinstance(node, dict) and isinstance(node.get("rec_texts"), list):
        return node
    if isinstance(node, list):
        for item in node:
            found = first_result(item)
            if found:
                return found
    return None

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: compact-benchmark-evidence.py RAW_RESULTS_JSON OUTPUT_JSON")
    source = Path(sys.argv[1]).expanduser().resolve()
    output = Path(sys.argv[2]).expanduser().resolve()
    raw = json.loads(source.read_text(encoding="utf-8"))
    warm = raw.get("run2_warm")
    if not isinstance(warm, list) or not warm:
        raise RuntimeError("Missing run2_warm results")
    pages = []
    for page_index, page_node in enumerate(warm, 1):
        result = first_result(page_node)
        if not result:
            raise RuntimeError(f"Missing canonical result for warm page {page_index}")
        texts = result.get("rec_texts")
        scores = result.get("rec_scores")
        polys = result.get("rec_polys") or result.get("dt_polys")
        if not all(isinstance(value, list) and value for value in (texts, scores, polys)):
            raise RuntimeError(f"Missing OCR arrays for warm page {page_index}")
        if not (len(texts) == len(scores) == len(polys)):
            raise RuntimeError(f"Misaligned warm page {page_index}: {len(texts)}/{len(scores)}/{len(polys)}")
        pages.append({
            "pageIndex": page_index,
            "inputPath": result.get("input_path"),
            "counts": {"rec_texts": len(texts), "rec_scores": len(scores), "rec_polys": len(polys)},
            "items": [
                {"index": index, "text": texts[index], "score": scores[index], "polygon": polys[index]}
                for index in range(len(texts))
            ],
        })
    payload = {
        "sourceRun": "run2_warm",
        "sourcePath": str(source),
        "pageCount": len(pages),
        "pages": pages,
        "note": "Canonical warm OCR evidence only; no semantic values or reference data.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "sourceRun": "run2_warm", "pageCount": len(pages), "counts": [page["counts"] for page in pages]}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
