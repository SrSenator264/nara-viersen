# Flamo Agents Hub (مركز الوكلاء)

خدمة Node صغيرة بدون مكتبات، بتشغّل الوكلاء وبتتواصل معك على Telegram. الخطة: `../plans/PLAN_AGENTS_HUB.md`.

## الوكلاء (المرحلة 1)
| الوكيل | شو بيعمل |
|---|---|
| `watchdog` | كل دقيقتين بيفحص `FLAMO_URL/api/health`. تنبيه بعد فشلين متتاليين وإشعار لما يرجع |
| `mail-triage` | بيقرأ ملفات json من `MAIL_INBOX_DIR` (اللي بيحطها mail-agent)، وبيبعت تنبيه للمهم (Telekom, BGN, Strom/Gas, Finanzamt, Wise, مهل) |
| `nightly-tests` | الساعة 03:00 بيشغّل `NIGHTLY_CMD` (افتراضي Playwright e2e) وبيبعت الملخص |

## أوامر Telegram
`/status` الحالة · `/stop` إيقاف طوارئ لكل الوكلاء · `/resume` تشغيل الكل · `/resume اسم_الوكيل` تشغيل وكيل وقف بسبب أخطاء.
الأفعال الحساسة بتوصل مع زرّين ✅ تمام / ❌ لا (بتنتهي صلاحيتها بعد 24 ساعة).

## وضع التجربة
`HUB_DRY_RUN=1` (الافتراضي): الوكلاء بيشتغلوا وبتوصلك رسائل بعلامة 🧪، بس ما بيتحرك ولا شي (الإيميلات بتضل مكانها، والموافقات ما بتنفّذ). لما تتأكد: `HUB_DRY_RUN=0`.

## التشغيل على الـ NAS (Docker)
1. انسخ مجلد `agents-hub` للـ NAS، وانسخ `.env.example` لـ `.env` واملأه (التوكن بتكتبه بإيدك بالملف، مو بالمحادثة).
2. `docker compose up -d --build`
3. اكتب `/status` للبوت.

## اختبار
`node --test agents-hub/tests/hub.test.js`
