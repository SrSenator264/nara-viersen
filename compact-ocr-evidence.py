"""Compact the existing canonical warm OCR result for coordinate-level parsing.
This utility does not run OCR, call Gemini, or read NARA business data.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "local-ocr-output" / "lightweight" / "raw-results.json"
OUTPUT = ROOT / "local-ocr-output" / "parser-poc" / "warm-coordinate-evidence.json"

def main():
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    warm = raw.get("run2_warm")
    if not isinstance(warm, list) or not warm:
        raise RuntimeError("Missing run2_warm in OCR output")

    # PaddleOCR output is normally [page_results][result]. Select the first
    # canonical result only; never combine cold and warm results.
    result = warm[0][0] if isinstance(warm[0], list) else warm[0]
    texts = result.get("rec_texts")
    scores = result.get("rec_scores")
    polys = result.get("rec_polys") or result.get("dt_polys")
    if not isinstance(texts, list) or not isinstance(scores, list) or not isinstance(polys, list):
        raise RuntimeError("Canonical warm result lacks rec_texts, rec_scores, or rec_polys/dt_polys")
    if not texts or len(texts) != len(scores) or len(texts) != len(polys):
        raise RuntimeError(f"Misaligned OCR arrays: texts={len(texts)}, scores={len(scores)}, polys={len(polys)}")

    evidence = {
        "sourceRun": "run2_warm",
        "sourcePath": str(SOURCE.resolve()),
        "inputPath": result.get("input_path"),
        "counts": {"rec_texts": len(texts), "rec_scores": len(scores), "rec_polys": len(polys)},
        "items": [
            {"index": i, "text": texts[i], "score": scores[i], "polygon": polys[i]}
            for i in range(len(texts))
        ],
        "note": "Canonical OCR evidence only; no reference invoice data and no semantic values added."
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT.resolve()), "sourceRun": "run2_warm", "counts": evidence["counts"]}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
