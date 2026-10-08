"""Standalone development-only PaddleOCR invoice proof of concept."""
from __future__ import annotations
import json, os, platform, sys, time, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LIGHTWEIGHT = "--lightweight" in sys.argv
COMPACT_OUTPUT = next((Path(sys.argv[i+1]).expanduser().resolve() for i,a in enumerate(sys.argv[:-1]) if a=="--compact-output"), None)
OUT = ROOT / "local-ocr-output" / ("lightweight" if LIGHTWEIGHT else "ppstructure")
OUT.mkdir(parents=True, exist_ok=True)

def choose_pages(arguments):
    if arguments:
        pages = [Path(item).expanduser().resolve() for item in arguments]
        missing = [str(p) for p in pages if not p.is_file()]
        if missing:
            raise FileNotFoundError("Input page(s) not found:\n" + "\n".join(missing))
        return pages
    preferred = [ROOT / "data/documents/doc_mugso0h0_h432il_001.jpeg", ROOT / "data/documents/doc_mugso0h0_h432il_002.jpeg"]
    if all(p.exists() for p in preferred):
        return preferred
    pages = sorted((ROOT / "data/documents").glob("*.jpeg"))
    if not pages:
        raise FileNotFoundError("No development invoice JPEG under data/documents.")
    return pages[:2]

def jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)): return value
    if isinstance(value, Path): return str(value)
    if hasattr(value, "tolist"):
        try: return jsonable(value.tolist())
        except Exception: pass
    if isinstance(value, dict): return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [jsonable(v) for v in value]
    for attr in ("json", "to_json"):
        try:
            v = getattr(value, attr); v = v() if callable(v) else v
            if v is not value: return jsonable(v)
        except Exception: pass
    try: return jsonable(dict(value))
    except Exception: return repr(value)

def text_and_confidence(value):
    data, texts, scores = jsonable(value), [], []
    def walk(node):
        if isinstance(node, dict):
            for key, item in node.items():
                low = str(key).lower()
                if low in {"text", "rec_text", "transcription"} and isinstance(item, str): texts.append(item)
                if ("score" in low or "confidence" in low) and isinstance(item, (int, float)): scores.append(item)
                if low in {"rec_texts", "texts", "transcriptions"} and isinstance(item, list):
                    texts.extend(str(text) for text in item if text is not None)
                if low in {"rec_scores", "scores", "confidences"} and isinstance(item, list):
                    scores.extend(float(score) for score in item if isinstance(score, (int, float)))
                walk(item)
        elif isinstance(node, list):
            for item in node: walk(item)
    walk(data)
    return data, texts, scores

def markdown(value):
    for attr in ("markdown", "to_markdown"):
        try:
            v = getattr(value, attr); v = v() if callable(v) else v
            if isinstance(v, str): return v
            if isinstance(v, dict): return str(v.get("markdown_texts") or v.get("markdown") or v)
        except Exception: pass
    return ""

def save_outputs(label, cold, warm, timing):
    results = {"pipeline": label, "run1_cold": [jsonable(x) for x in cold], "run2_warm": [jsonable(x) for x in warm]}
    (OUT / "raw-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    raw, md, scores = [], [], []
    for run_label, batch in (("RUN 1 COLD", cold), ("RUN 2 WARM", warm)):
        raw.append(run_label)
        for index, result in enumerate(batch, 1):
            _, texts, found_scores = text_and_confidence(result); scores.extend(found_scores)
            raw.append(f"\n--- PAGE/RESULT {index} ---\n" + "\n".join(texts))
            m = markdown(result)
            if m: md.append(f"\n## {run_label} page/result {index}\n\n{m}\n")
    (OUT / "raw-text.txt").write_text("\n".join(raw), encoding="utf-8")
    if md: (OUT / "structured-results.md").write_text("# Local PaddleOCR invoice output\n" + "\n".join(md), encoding="utf-8")
    summary = {**timing, "pipeline": label, "result_count_cold": len(cold), "result_count_warm": len(warm), "confidence_count": len(scores), "confidence_min": min(scores) if scores else None, "confidence_avg": sum(scores)/len(scores) if scores else None, "output_directory": str(OUT), "note": "Raw OCR only; no semantic values are invented or written to NARA."}
    (OUT / "timing-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

def compact_items(result, page_index):
    data=jsonable(result)
    def find(node, keys):
        if isinstance(node, dict):
            for key in keys:
                if key in node and isinstance(node[key], list): return node[key]
            for value in node.values():
                found=find(value,keys)
                if found is not None:return found
        elif isinstance(node,list):
            for value in node:
                found=find(value,keys)
                if found is not None:return found
        return None
    texts=find(data,{"rec_texts","texts","transcriptions"}) or []
    scores=find(data,{"rec_scores","scores","confidences"}) or []
    polys=find(data,{"rec_polys","dt_polys","polys","boxes"}) or []
    n=min(len(texts),len(scores),len(polys))
    return {"pageIndex":page_index,"items":[{"index":i,"text":str(texts[i]),"score":float(scores[i]),"polygon":polys[i]} for i in range(n)],"counts":{"rec_texts":len(texts),"rec_scores":len(scores),"rec_polys":len(polys)}}

def main():
    arguments=[]; skip=False
    for arg in sys.argv[1:]:
        if skip: skip=False; continue
        if arg in ("--lightweight","--compact-output"):
            skip=(arg=="--compact-output"); continue
        arguments.append(arg)
    pages = choose_pages(arguments)
    print("SELECTED PAGES:", *[str(p) for p in pages], sep="\n  ")
    versions = {}
    try:
        import paddle
        versions["paddlepaddle"] = getattr(paddle, "__version__", "unknown")
    except Exception as exc:
        versions["paddlepaddle_error"] = f"{type(exc).__name__}: {exc}"
    try:
        import paddleocr
        versions["paddleocr"] = getattr(paddleocr, "__version__", "unknown")
    except Exception as exc:
        versions["paddleocr_error"] = f"{type(exc).__name__}: {exc}"
    try:
        import paddlex
        versions["paddlex"] = getattr(paddlex, "__version__", "unknown")
    except Exception as exc:
        versions["paddlex_error"] = f"{type(exc).__name__}: {exc}"
    try:
        import numpy
        versions["numpy"] = getattr(numpy, "__version__", "unknown")
    except Exception as exc:
        versions["numpy_error"] = f"{type(exc).__name__}: {exc}"
    versions["python"] = sys.version
    versions["executable"] = sys.executable
    print("OCR VERSIONS:", json.dumps(versions, ensure_ascii=False))
    timing = {"python": sys.version, "platform": platform.platform(), "pages": [str(p) for p in pages]}
    print("INPUT:", *pages, sep="\n  ")

    def run_lightweight(is_fallback=False):
        from paddleocr import PaddleOCR
        started = time.perf_counter()
        pipeline = PaddleOCR(
            lang="german",
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        init_done = time.perf_counter()
        cold, cold_page_seconds = [], []
        for page in pages:
            page_started = time.perf_counter()
            cold.append(list(pipeline.predict(input=str(page))))
            cold_page_seconds.append(round(time.perf_counter() - page_started, 3))
        run_timing = {**timing, "fallback": is_fallback, "mode": "lightweight-mobile", "initialization_seconds": round(init_done - started, 3), "cold_page_seconds": cold_page_seconds, "cold_ocr_seconds": round(time.perf_counter() - init_done, 3), "stages": "PaddleOCR pipeline does not expose separate detector/recognizer timers; page timings cover preprocessing+detection+recognition."}
        started = time.perf_counter()
        warm, warm_page_seconds = [], []
        for page in pages:
            page_started = time.perf_counter()
            warm.append(list(pipeline.predict(input=str(page))))
            warm_page_seconds.append(round(time.perf_counter() - page_started, 3))
        run_timing["warm_page_seconds"] = warm_page_seconds
        run_timing["warm_seconds"] = round(time.perf_counter() - started, 3)
        if COMPACT_OUTPUT:
            COMPACT_OUTPUT.parent.mkdir(parents=True,exist_ok=True)
            payload={"sourceRun":"run2_warm","pageCount":len(warm),"pages":[compact_items(result,index) for index,result in enumerate(warm)]}
            COMPACT_OUTPUT.write_text(json.dumps(payload,ensure_ascii=False),encoding="utf-8")
            print(json.dumps({"compactOutput":str(COMPACT_OUTPUT),"pageCount":len(warm),"counts":[p["counts"] for p in payload["pages"]]},ensure_ascii=False))
        else: save_outputs("PaddleOCR-light-german", cold, warm, run_timing)
        return 0

    if LIGHTWEIGHT:
        try:
            return run_lightweight()
        except Exception as exc:
            tb = traceback.format_exc()
            (OUT / "error.json").write_text(json.dumps({"type": type(exc).__name__, "message": str(exc), "traceback": tb, "output_directory": str(OUT)}, ensure_ascii=False, indent=2), encoding="utf-8")
            (OUT / "fallback-error-traceback.txt").write_text(tb, encoding="utf-8")
            print("LIGHTWEIGHT_OCR_ERROR_TRACEBACK:\n" + tb, file=sys.stderr)
            return 1

    try:
        from paddleocr import PPStructureV3
    except Exception as exc:
        tb = traceback.format_exc()
        (OUT / "error.json").write_text(json.dumps({"type": type(exc).__name__, "message": str(exc), "traceback": tb, "output_directory": str(OUT)}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"PADDLE_IMPORT_ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    try:
        started = time.perf_counter()
        pipeline = PPStructureV3(lang="german", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
        cold = list(pipeline.predict(input=[str(p) for p in pages]))
        timing["cold_seconds"] = round(time.perf_counter() - started, 3)
        started = time.perf_counter()
        warm = list(pipeline.predict(input=[str(p) for p in pages]))
        timing["warm_seconds"] = round(time.perf_counter() - started, 3)
        save_outputs("PP-StructureV3", cold, warm, timing); return 0
    except Exception as exc:
        tb = traceback.format_exc()
        (OUT / "ppstructure-error-traceback.txt").write_text(tb, encoding="utf-8")
        print("PPSTRUCTURE_ERROR_TRACEBACK:\n" + tb, file=sys.stderr)
        print("PP-StructureV3 unavailable; falling back to lightweight German OCR.", file=sys.stderr)
        try:
            return run_lightweight(is_fallback=True)
        except Exception as fallback_exc:
            fallback_tb = traceback.format_exc()
            (OUT / "fallback-error-traceback.txt").write_text(fallback_tb, encoding="utf-8")
            error = {"type": type(exc).__name__, "message": str(exc), "ppstructure_traceback": tb, "fallback_type": type(fallback_exc).__name__, "fallback_message": str(fallback_exc), "fallback_traceback": fallback_tb, "output_directory": str(OUT)}
            (OUT / "error.json").write_text(json.dumps(error, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"OCR_RUNTIME_ERROR: {type(fallback_exc).__name__}: {fallback_exc}", file=sys.stderr)
            return 1

if __name__ == "__main__": raise SystemExit(main())
