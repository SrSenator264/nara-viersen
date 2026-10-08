"""Standalone deterministic parser/validator for compact local OCR evidence.
Reference data is loaded only for optional scoring after candidate extraction.
"""
from __future__ import annotations
import argparse, json, re, time
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
MONEY = re.compile(r"^\d+[,.]\d{2}$")
VAT = re.compile(r"^(?:0|7|19)\s*%$")
QTY = re.compile(r"^(\d+(?:[,.]\d+)?)\s*(Karton|Beutel|Packung|Kanister|Eimer|Tray|Flasche|Stück|Dose|Kiste|KG|g|ml|Liter|l)?$", re.I)
SKIP = {"verkauf", "itemcode", "menge me", "artikelbezeichnung", "e-preis", "g-preis", "mw", "pin", "netto", "trnr", "beg", "ende", "tse", "sigz", "sign"}

def number(value):
    if value is None: return None
    text = str(value).strip().replace(",", ".")
    try: return float(text)
    except ValueError: return None

def boxes(page):
    result = []
    for item in page.get("items", []):
        poly = item.get("polygon") or []
        xs = [p[0] for p in poly if isinstance(p, list) and len(p) > 1]
        ys = [p[1] for p in poly if isinstance(p, list) and len(p) > 1]
        if not xs or not ys: continue
        result.append({**item, "xc": (min(xs)+max(xs))/2, "yc": (min(ys)+max(ys))/2})
    return result

def parse_pages(evidence):
    candidates = []
    for page in evidence.get("pages", []):
        items = boxes(page)
        item_index = next((i for i,b in enumerate(items) if b["text"].strip().lower()=="itemcode"), 0)
        first_anchor = next((i for i,b in enumerate(items[item_index+1:], item_index+1) if b["xc"] < 260 and re.fullmatch(r"[A-Za-z0-9]{3,20}", b["text"].strip()) and b["text"].strip().lower() not in SKIP), len(items))
        headers = {b["text"].strip().lower(): b for b in items[:first_anchor]}
        col = {"qty": headers.get("menge me", {}).get("xc", 430), "desc": headers.get("artikelbezeichnung", {}).get("xc", 650), "price": headers.get("e-preis", {}).get("xc", 1180), "total": headers.get("g-preis", {}).get("xc", 1300), "vat": headers.get("mw", {}).get("xc", 1450)}
        anchors = [b for b in items[item_index+1:] if b["xc"] < 260 and re.fullmatch(r"[A-Za-z0-9]{3,20}", b["text"].strip()) and b["text"].strip().lower() not in SKIP]
        def column(low, high, pattern): return sorted([b for b in items if low <= b["xc"] < high and pattern(b["text"].strip())], key=lambda b:b["yc"])
        price = column((col["desc"]+col["price"])/2, (col["price"]+col["total"])/2, MONEY.match)
        total = column((col["price"]+col["total"])/2, (col["total"]+col["vat"])/2, MONEY.match)
        vat = column((col["total"]+col["vat"])/2, 2000, VAT.match)
        for index, anchor in enumerate(anchors):
            row = [b for b in items if abs(b["yc"]-anchor["yc"]) <= 30]
            qbox = next((b for b in sorted(row, key=lambda b:abs(b["yc"]-anchor["yc"])) if col["qty"]-130 <= b["xc"] < (col["qty"]+col["desc"])/2 and QTY.match(b["text"].strip())), None)
            qmatch = QTY.match(qbox["text"].strip()) if qbox else None
            def aligned(values): return values[index] if len(values) == len(anchors) and index < len(values) else None
            pbox, tbox, vbox = aligned(price), aligned(total), aligned(vat)
            if not pbox: pbox = next((b for b in row if (col["desc"]+col["price"])/2 <= b["xc"] < (col["price"]+col["total"])/2 and MONEY.match(b["text"].strip())), None)
            if not tbox: tbox = next((b for b in row if (col["price"]+col["total"])/2 <= b["xc"] < (col["total"]+col["vat"])/2 and MONEY.match(b["text"].strip())), None)
            if not vbox: vbox = next((b for b in row if b["xc"] >= (col["total"]+col["vat"])/2 and VAT.match(b["text"].strip())), None)
            candidates.append({"articleNumber": anchor["text"].strip(), "quantity": number(qmatch.group(1)) if qmatch else None, "unit": qmatch.group(2) if qmatch else None, "unitPrice": number(pbox["text"]) if pbox else None, "lineTotal": number(tbox["text"]) if tbox else None, "vatRate": number(vbox["text"].replace("%", ""))/100 if vbox else None, "evidence": {"article": anchor["index"], "quantity": qbox and qbox["index"], "unitPrice": pbox and pbox["index"], "lineTotal": tbox and tbox["index"], "vat": vbox and vbox["index"]}, "sourceConfidence": min((b.get("score") for b in row if isinstance(b.get("score"),(int,float))), default=None)})
    return candidates

def validate(rows, pages):
    warnings=[]
    for row in rows:
        if row["quantity"] is None or row["unitPrice"] is None: warnings.append({"article":row["articleNumber"],"reason":"missing quantity or unit price"})
        if row["lineTotal"] is not None and row["quantity"] is not None and row["unitPrice"] is not None and abs(row["quantity"]*row["unitPrice"]-row["lineTotal"]) > .02: warnings.append({"article":row["articleNumber"],"reason":"line arithmetic mismatch"})
    totals={"lineTotalSum":round(sum(r["lineTotal"] for r in rows if r["lineTotal"] is not None),2),"net":None,"vat":None,"vatComponents":[],"gross":None,"derivedVat":False,"status":"INCOMPLETE_OCR_TOTALS","warnings":[],"provenance":{}}
    for page in pages:
        flat=[]
        for item in page.get("items",[]):
            poly=item.get("polygon") or []; xs=[p[0] for p in poly if isinstance(p,list) and len(p)>1]; ys=[p[1] for p in poly if isinstance(p,list) and len(p)>1]
            if xs and ys: flat.append({**item,"xc":(min(xs)+max(xs))/2,"yc":(min(ys)+max(ys))/2})
        if not flat: continue
        footer_start=min(x["yc"] for x in flat)+.55*(max(x["yc"] for x in flat)-min(x["yc"] for x in flat))
        footer=[x for x in flat if x["yc"]>=footer_start]
        def ev(item): return {"page":page.get("pageIndex"),"index":item.get("index"),"text":item.get("text"),"score":item.get("score"),"polygon":item.get("polygon")}
        def value_for(label):
            options=[x for x in footer if x["xc"]>label["xc"] and abs(x["yc"]-label["yc"])<=35 and MONEY.match(str(x.get("text","")).strip())]
            return min(options,key=lambda x:abs(x["yc"]-label["yc"])) if options else None
        for label in footer:
            text=str(label.get("text","")).strip().lower(); found=None
            if text in {"netto","nettobetrag"} and totals["net"] is None:
                found=value_for(label); totals["net"]=number(found["text"]) if found else None
                if found: totals["provenance"]["net"]={"label":ev(label),"amount":ev(found)}
            if "rechnungsbetrag" in text or text in {"gesamt","gesamtbetrag","gross"}:
                found=value_for(label); totals["gross"]=number(found["text"]) if found else totals["gross"]
                if found: totals["provenance"]["gross"]={"label":ev(label),"amount":ev(found)}
            vat_match=re.search(r"(?:ust|mwst|mw)\.?\s*(0|7|19)\s*%",text)
            if vat_match and (found:=value_for(label)):
                totals["vatComponents"].append({"rate":number(vat_match.group(1))/100,"amount":number(found["text"]),"evidence":{"label":ev(label),"amount":ev(found)}})
    totals["vat"]=round(sum(x["amount"] for x in totals["vatComponents"]),2) if totals["vatComponents"] else None
    line_sum=totals["lineTotalSum"]
    for field in ("net","gross"):
        if totals[field] is not None and line_sum and not (.5*line_sum<=totals[field]<=1.5*line_sum):
            totals["warnings"].append({"field":field,"reason":"footer total implausible relative to line-total sum"}); totals[field]=None
    if totals["vat"] is not None and totals["gross"] is not None and totals["vat"]>totals["gross"]:
        totals["warnings"].append({"field":"vat","reason":"VAT exceeds gross total"}); totals["vat"],totals["vatComponents"]=None,[]
    if totals["vat"] is None and totals["net"] is not None and totals["gross"] is not None:
        derived=round(totals["gross"]-totals["net"],2)
        if derived>=0: totals["vat"],totals["derivedVat"]=derived,True; totals["provenance"]["vat"]={"derivedFrom":["net","gross"]}
    checks=[]
    if totals["net"] is not None and totals["vat"] is not None and totals["gross"] is not None: checks.append(abs(totals["net"]+totals["vat"]-totals["gross"])<=.02)
    if totals["net"] is not None: checks.append(abs(line_sum-totals["net"])<=.02)
    if checks and all(checks): totals["status"]="OK"
    elif checks: totals["status"]="ARITHMETIC_MISMATCH"
    return warnings, totals

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--evidence", nargs="+", required=True); ap.add_argument("--invoice", nargs="+"); ap.add_argument("--output"); args=ap.parse_args(); started=time.perf_counter(); reports=[]
    invoices=args.invoice or [None]*len(args.evidence)
    if len(invoices)!=len(args.evidence): raise SystemExit("--invoice count must match --evidence count")
    for path, invoice in zip(args.evidence,invoices):
        evidence=json.loads(Path(path).read_text(encoding="utf-8")); rows=parse_pages(evidence); warnings,totals=validate(rows,evidence.get("pages",[])); report={"invoiceNumber":invoice,"pages":evidence.get("pageCount"),"positions":rows,"quality":{"rows":len(rows),"articles":sum(bool(r["articleNumber"]) for r in rows),"quantities":sum(r["quantity"] is not None for r in rows),"prices":sum(r["unitPrice"] is not None for r in rows),"vat":sum(r["vatRate"] is not None for r in rows)},"warnings":warnings,"totals":totals,"requiresFallback":bool(warnings) or totals["status"]!="OK","parserSeconds":round(time.perf_counter()-started,3)}; reports.append(report)
    payload={"reports":reports}
    if args.output: Path(args.output).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"reports":[{"invoiceNumber":r["invoiceNumber"],"quality":r["quality"],"totals":r["totals"],"warnings":r["warnings"],"requiresFallback":r["requiresFallback"],"parserSeconds":r["parserSeconds"]} for r in reports]},ensure_ascii=False,indent=2))
if __name__=="__main__": main()
