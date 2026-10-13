# NARA — خطة مؤجلة

## بيئات التشغيل المنفصلة

تنفيذ لاحق بعد استقرار الكاشير وربط Hardware-TSE:

- زر واضح للتنقل بين:
  - الكاشير الحقيقي Production
  - Staging للتطوير والاختبار
  - DEM للتدريب
- فصل البيانات والطلبات والمخزون لكل بيئة.
- منع DEM وStaging من الاتصال بالـTSE أو التأثير على المبيعات الحقيقية.
- حماية الانتقال إلى Production عبر PIN أو تأكيد واضح.
- إعادة تحميل آمنة عند تبديل البيئة.
- تذكير بهذه الخطة قبل بدء مرحلة ربط Hardware-TSE النهائي.

## ملاحظات الزباين التلقائية (لاحقاً)

- استخراج تفضيلات الأكل تلقائياً من ملاحظات وتعليقات طلبات الزبون السابقة (مثلاً "ohne Zwiebeln"، "extra knusprig") وعرضها للمطبخ كملاحظة 🤖.
- فصل ملاحظات الأكل عن ملاحظات التوصيل ("Deliver to door"، "nicht klingeln") اللي بتروح للسواق مو للمطبخ.
- الملاحظة اليدوية (✎) بتتفوّق دائماً على التلقائية، ويتحدّث الاستخراج بعد كل طلب جديد.
- الأساس جاهز: `data/customer-notes.json` + `/api/customer-hint` + قاعدة الزباين (`orderIds`).

## Umbenennung NARA → Flamo (beschlossen, Umsetzung in Etappen)

- Ab jetzt heißt alles **Flamo** (Marke, Website, App-Oberfläche, Belege). Der interne Code-Name NARA (Dateien, `NARA_*`-Variablen, Repo) bleibt vorerst, damit nichts bricht.
- Etappe 1 (sichtbar): App-Titel/Sidebar/Kacheln, Beleg-Kopf, E-Mails, Website-Texte auf „Flamo“.
- Etappe 2 (Website): **Design C** (`web-prototype/c.html`) ersetzt das alte Kundendesign; A und B aus der Seitenleiste entfernen (Dateien archivieren, nicht löschen). Sidebar-Eintrag heißt „Flamo“.
- Etappe 3 (optional, spät): Repo/Variablen/Skripte umbenennen – nur mit Migrationsanleitung.
- Offen: Markenprüfung (DPMA/EUIPO, Markenanwalt), Gewerbe-Ummeldung, Domain.

## Flamo-Figur ohne neue Videos (Ideen, später)

- Ziel: Flamo per Prompt/Code beliebig bewegen, ohne jedes Mal ein Video zu generieren.
- Option A: 2D-Teile (Körper, Augen, Arme, Beine, Handschuhe, Schuhe) + Skelett (Rive oder Spine) → Animationen live im Browser.
- Option B: 3D-Modell mit Skelett (Rig) → Posen/Animationen per Code, Export als Video/Standbild.
- Option C: weiter KI-Video, aber Bewegungsbibliothek gezielt erweitern (fehlende Aktionen einmal generieren).
- Entscheidung später; zuerst Bedarf klären (Website-Interaktion vs. Social-Videos).

## Flamo als Chef-Agent / Außenbereich (Ideen)

- Außenfarme (externe Schiene) und Ideen für drinnen im Laden zum Thema Flamo sammeln.

## Vor dem Launch (zurückgestellt, 13.10.)
- Trainingsmodus: Server lehnt `training:true` von Nicht-OWNER/MANAGER ab (403) + Test `auth-server.test.js` anpassen.
- Trainingsmodus: deutlicher Hinweis (Balken/Farbe) nur für den Owner, damit keine Verwechslung mit echten Verkäufen.
- Später: Schalter nur für OWNER (MANAGER raus).
