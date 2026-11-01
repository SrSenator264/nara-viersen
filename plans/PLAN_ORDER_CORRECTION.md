# Plan: Order correction ("✏️ تصحيح") from the Sales page

Status: planned. PRIORITY RAISED (2026-11-01): Storno is legally required, so this must be done BEFORE the cashier is treated as a legal device (same gate as PLAN_TSE_SWISSBIT items 1-4). Start in a fresh single-topic session. Suggested model: Sonnet (Opus for the tax-sensitive review).

Until it is built: staff write every mistaken order by hand (order no., what went wrong, date) and delete nothing. Omar asks the accountant / Finanzamt what is accepted in the transition period.

## Why
A paid cashier order sometimes needs a fix. After payment (and once the Swissbit TSE is connected) the transaction is closed and cannot be edited. The correct way is a Storno of the old order plus a new order with the fixed content.

## What the TSE records (for reference)
Per transaction: TSE transaction number, start/end time, process type, amounts per VAT rate and per payment type, signature + signature counter + TSE serial. It does NOT store items, customer name or the Flamo receipt number. A Storno is its own new transaction (negative amounts); it never erases the old one.

## Definition of Done
Must work
1. A "✏️ تصحيح / Korrigieren" button in the sales detail dialog (sales.html), only for COMPLETED orders from the cashier, visible to the owner (and managers with permission).
2. Pressing it asks for a mandatory reason, then:
   - the old order becomes STORNIERT with an audit event (the existing STORNO action in server.js is the base; its receipt prefix is currently DEV-STORNO and must become a real Storno receipt number);
   - a NEW open order is created with the same items and opened in the cashier, ready to edit and pay.
3. The new order gets a new unique number linked to the old one; its receipt prints a line "Korrektur zu FLAMO-xxxxx" (correctionOf).
4. In the sales list the old order shows as cancelled (corrected) with a link to the new one.
5. Training mode: orders with training:true (isTest) can be reopened and edited freely, with no reason, no Storno, no correction number, and not blocked by a closed day. They never touch the real books or the TSE.

Edge cases
- Cannot correct an already cancelled/STORNIERT order, nor correct the same order twice.
- Platform orders (Lieferando, Uber Eats, Loco, ...) get no button; they are corrected on the platform.
- If the business day was already closed (تقفيلة), the button shows a warning and does not run (proposal, can be changed).

6. Every cart clear / line removal is logged (who, when, what was removed), in the audit log (today the clear-cart handler in kasse-domain.js deletes without a trace).
7. After the order was sent to the kitchen or paid, cancelling is only possible as Storno with a mandatory reason (no silent delete).
8. "فحص التطابق" page: compares cashier records with the TSE (count, amounts, signature numbers) and shows differences; usable when an inspector prints from the TSE USB. Needs the real TSE connected.

Booklet: once 1-4 work, add the Storno page to anleitung.html (3 languages), bump VER/DATE, export a new dated German PDF (see PLAN_CASHIER_BOOKLET.md).

Not blockers
- Real TSE signing of the Storno and the new order (separate plan: PLAN_TSE_SWISSBIT.md, when the USB TSE is connected).
- Editing platform orders; changing the receipt layout.

Tests
- All existing tests stay green; add tests for: button visibility, Storno + new order creation, correctionOf line on the receipt, double-correction block, training-mode free edit, closed-day block.

## Implementation notes (found 2026-10-31)
- The cashier keeps its orders on the device (localStorage) and syncs them with ORDER_SYNC (/api/kasse/events); a completed/cancelled/STORNIERT order id is rejected as ORDER_ID_COLLISION, so the new order needs a fresh id.
- Plan: a new server action that copies the old order into a new OPEN order (new id, correctionOf set) and returns it, then the cashier opens it (the open-orders drawer in kasse-open-orders.js already reads server open orders).

## Related open item
Sales detail shows item price as 0.00 € while the total is correct (sales.html reads i.totalCents ?? i.priceCents; cart items use unitCents). Check that the printed receipt is right.
