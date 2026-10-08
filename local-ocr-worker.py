"""Persistent development OCR worker. Protocol: one JSON request/response per line."""
from __future__ import annotations
import contextlib, json, os, sys, time, traceback
from pathlib import Path

os.environ.setdefault("FLAGS_enable_pir_api", "0")
ROOT = Path(__file__).resolve().parent

def jsonable(value, profile=None, root_wrapper=False, path="result"):
    if value is None or isinstance(value, (str, int, float, bool)): return value
    if hasattr(value, "tolist"):
        started = time.perf_counter() if profile is not None else None
        try:
            converted = value.tolist()
            if profile is not None:
                profile.setdefault("numpyBranches", []).append({"path": path, "type": type(value).__name__, "shape": safe_shape(value), "dtype": safe_dtype(value), "elapsedMs": None, "requiredFor": required_role(path)})
            return jsonable(converted, profile=profile, path=path)
        except Exception: pass
        finally:
            if profile is not None and started is not None:
                elapsed = round((time.perf_counter() - started) * 1000, 3)
                profile["numpyToListMs"] = profile.get("numpyToListMs", 0) + elapsed
                for branch in reversed(profile.get("numpyBranches", [])):
                    if branch["path"] == path and branch["elapsedMs"] is None:
                        branch["elapsedMs"] = elapsed
                        break
    if isinstance(value, dict):
        started = time.perf_counter() if profile is not None else None
        converted = {}
        for key, item in value.items():
            branch_started = time.perf_counter() if profile is not None and root_wrapper else None
            branch_path = f"{path}.{key}"
            converted[str(key)] = jsonable(item, profile=profile, path=branch_path)
            if branch_started is not None:
                elapsed = round((time.perf_counter() - branch_started) * 1000, 3)
                if elapsed > 100:
                    profile.setdefault("slowBranches", []).append({"path": branch_path, "key": str(key), "type": type(item).__name__, "shape": safe_shape(item), "elapsedMs": elapsed})
        if profile is not None and started is not None:
            profile["dictTraversalMs"] = profile.get("dictTraversalMs", 0) + round((time.perf_counter() - started) * 1000, 3)
        return converted
    if isinstance(value, (list, tuple)):
        started = time.perf_counter() if profile is not None else None
        converted = [jsonable(item, profile=profile, path=f"{path}[{index}]") for index, item in enumerate(value)]
        if profile is not None and started is not None:
            profile["listTraversalMs"] = profile.get("listTraversalMs", 0) + round((time.perf_counter() - started) * 1000, 3)
        return converted
    try:
        started = time.perf_counter() if profile is not None else None
        converted = dict(value)
        if profile is not None and started is not None:
            profile["wrapperDictConversionMs"] = round((time.perf_counter() - started) * 1000, 3)
            profile["topLevelKeys"] = [str(key) for key in converted.keys()]
            return jsonable(converted, profile=profile, root_wrapper=True, path="result")
        return jsonable(converted)
    except Exception: return repr(value)

def safe_shape(value):
    shape = getattr(value, "shape", None)
    if shape is not None:
        try: return [int(x) for x in shape]
        except Exception: return str(shape)
    if isinstance(value, (list, tuple, dict)): return len(value)
    return None

def safe_dtype(value):
    dtype = getattr(value, "dtype", None)
    return str(dtype) if dtype is not None else None

def required_role(path):
    low = path.lower()
    if "rec_text" in low or low.endswith(".texts") or "transcription" in low: return "rec_texts"
    if "rec_score" in low or low.endswith(".scores") or "confidence" in low: return "rec_scores"
    if "rec_poly" in low or "dt_poly" in low or low.endswith(".polys") or low.endswith(".boxes"): return "rec_polys"
    return None

def find(data, keys):
    if isinstance(data, dict):
        for key in keys:
            if key in data and isinstance(data[key], list): return data[key]
        for value in data.values():
            found = find(value, keys)
            if found is not None: return found
    elif isinstance(data, list):
        for value in data:
            found = find(value, keys)
            if found is not None: return found
    return None

def compact(result, page_index):
    profile = {"slowBranches": []}
    started = time.perf_counter()
    data = jsonable(result, profile=profile)
    profile["jsonableTotalMs"] = round((time.perf_counter() - started) * 1000, 3)
    texts = find(data, {"rec_texts", "texts", "transcriptions"}) or []
    scores = find(data, {"rec_scores", "scores", "confidences"}) or []
    polys = find(data, {"rec_polys", "dt_polys", "polys", "boxes"}) or []
    if not texts or len(texts) != len(scores) or len(texts) != len(polys):
        raise RuntimeError(f"OCR evidence arrays are not aligned: texts={len(texts)} scores={len(scores)} polys={len(polys)}")
    evidence = {"pageIndex": page_index, "items": [{"index": i, "text": str(texts[i]), "score": float(scores[i]), "polygon": polys[i]} for i in range(len(texts))], "counts": {"rec_texts": len(texts), "rec_scores": len(scores), "rec_polys": len(polys)}}
    return evidence, profile

def main():
    init_started = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        from paddleocr import PaddleOCR
        pipeline = PaddleOCR(lang="german", text_detection_model_name="PP-OCRv5_mobile_det", text_recognition_model_name="PP-OCRv5_mobile_rec", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    print(json.dumps({"type":"READY", "startupMs": round((time.perf_counter()-init_started)*1000), "python": sys.version, "executable": sys.executable}, ensure_ascii=False), flush=True)
    for line in sys.stdin:
        if not line.strip(): continue
        started = time.perf_counter()
        try:
            request = json.loads(line); job_id = request.get("jobId"); pages = [str(Path(p).expanduser().resolve()) for p in request.get("pages", [])]
            if not job_id or not pages or any(not Path(p).is_file() for p in pages): raise FileNotFoundError("OCR job contains missing page(s)")
            paddle_started = time.perf_counter()
            with contextlib.redirect_stdout(sys.stderr):
                results = [list(pipeline.predict(input=page)) for page in pages]
            paddle_ms = round((time.perf_counter()-paddle_started)*1000)
            evidence_started = time.perf_counter()
            compacted = [compact(result, index) for index, result in enumerate(results)]
            evidence = {"sourceRun":"persistent_worker", "pageCount":len(results), "pages":[item[0] for item in compacted]}
            profiles = [item[1] for item in compacted]
            profile_totals = {"jsonableTotalMs": round(sum(item.get("jsonableTotalMs", 0) for item in profiles), 3), "wrapperDictConversionMs": round(sum(item.get("wrapperDictConversionMs", 0) for item in profiles), 3), "numpyToListMs": round(sum(item.get("numpyToListMs", 0) for item in profiles), 3), "dictTraversalMs": round(sum(item.get("dictTraversalMs", 0) for item in profiles), 3), "listTraversalMs": round(sum(item.get("listTraversalMs", 0) for item in profiles), 3), "topLevelKeys": [item.get("topLevelKeys", []) for item in profiles], "slowBranches": [branch for item in profiles for branch in item.get("slowBranches", [])], "numpyBranches": [branch for item in profiles for branch in item.get("numpyBranches", [])]}
            evidence_build_ms = round((time.perf_counter()-evidence_started)*1000)
            total_worker_ms = round((time.perf_counter()-started)*1000)
            payload = {"type":"RESULT", "jobId":job_id, "evidence":evidence, "ocrMs":total_worker_ms, "timings":{"requestReceivedMs":0,"imageLoadMs":None,"preprocessingMs":None,"paddlePredictMs":paddle_ms,"detectorMs":None,"recognizerMs":None,"postprocessMs":evidence_build_ms,"evidenceBuildMs":evidence_build_ms,"evidenceWriteMs":None,"totalWorkerJobMs":total_worker_ms,"pages":len(pages),"inferenceCalls":len(pages),"evidenceDiagnostics":profile_totals}}
            print(json.dumps(payload, ensure_ascii=False), flush=True)
        except Exception as exc:
            print(json.dumps({"type":"ERROR", "jobId":locals().get("job_id"), "error":{"name":type(exc).__name__,"message":str(exc),"traceback":traceback.format_exc()}}, ensure_ascii=False), flush=True)

if __name__ == "__main__": main()
