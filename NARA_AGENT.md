# NARA Agent Context

## PROJECT RULES
- Preserve the current working NARA incrementally.
- Create a checkpoint before meaningful or risky changes.
- Never work from backup folders.
- Do not rewrite working systems unnecessarily.
- Fix → test → retest autonomously.
- Ordinary reversible technical decisions do not require Omar's approval.

## SAFETY
### Development data permission
The current NARA data environment is development/test data until Omar explicitly declares NARA ready for production. Current invoices, stock quantities, StockMovements, test ingredients, supplier mappings, and operational data may be created or modified for testing. Full local end-to-end test flows, including test Wareneingang, stock changes, corrections, and Storno, are allowed when needed to verify functionality. Treat such records as development/test data where practical.

Keep creating checkpoints before meaningful code/data changes and never destroy the last stable working code state. Before real restaurant operation, NARA will have a controlled development-data cleanup/reset and Omar will perform a physical inventory count (Inventur) for clean opening stock.

This permission applies only to NARA's local development/test business data. It does not authorize real payments, production TSE/fiscal transactions, external publishing, real customer/supplier messages, real orders, or destructive actions outside the NARA development environment.

Ask Omar only for real business decisions or irreversible actions. If one item is blocked, continue other safe work.

## CONFIRMED NARA RULES
- Invoice extraction is review-first.
- Gemini must never directly change stock.
- Stock changes only after validated Wareneingang.
- Supplier mapping uses supplierId + articleNumber.
- Supplier package unit and inventory unit are separate.
- Example: 1 Karton may equal 400 Stück.
- Inventory may use Stück even when invoice contains weight.
- UI languages: DE / AR / EN.
- Business/product/supplier data is not translated.
- Loco products are not automatically merged with other products.
- TSE belongs to the fiscal/payment flow; kitchen printing can happen earlier.

## FUTURE PRODUCT AREAS
- Kasse + TSE
- Orders/Menu
- Lager/Rechnungen
- Rezepte + costing
- Employees + shifts + labor cost
- Vehicles + drivers + delivery
- purchasing/cost optimization
- accounting/reporting
- AI Manager
- marketing automation
- multi-restaurant/commercial product

Omar has additional innovative cost-saving ideas. Do not invent them; record them when provided.

## NARA AI MANAGER / ASK NARA
Future architecture rule: NARA should provide one integrated conversational AI layer for Omar across sales, orders, invoices, suppliers, stock, recipes/costs, employees/shifts/labor, vehicles/delivery, commissions, marketing, and accounting/reporting. New modules must expose clean structured internal interfaces so the AI can use live NARA data through controlled tools, never by scraping UI or receiving unrestricted database mutation access.

The AI may read/analyze directly; draft/propose changes for Omar to review; and must require explicit confirmation for sensitive or irreversible actions such as price changes, promotions, purchases, deletion, external messages, payments, fiscal/TSE actions, or other irreversible external effects. NARA remains the source of truth, with live retrieval, restaurant-specific rules/context, decision history, multilingual conversation, and later voice support.

Keep the planned customer-facing NARA AI Sales Agent distinct from the owner-facing NARA AI Manager. Do not implement the AI, API integration, or chat UI as part of documentation work.

## AUTONOMOUS WORK MODE
Within an approved task/milestone: inspect → implement → test → fix → retest.

Do not stop for trivial technical questions. Do not autonomously start unrelated major modules.

## TOKEN EFFICIENCY
- Read only files relevant to the current task.
- Do not repeatedly summarize NARA.
- Do not produce long reports.
- Do not repeatedly restate requirements.
- Reuse this file for persistent context.

## CURRENT PRIORITY
A. Finish/stabilize current language work.
B. Verify invoice → Zutat → Gebinde/Base Unit workflow.
C. Preserve draft/Wareneingang safety.
D. Stabilize Kasse/payment architecture.
E. Prepare TSE integration architecture.

For TSE: do not fake implementation or compliance. First inspect the current payment/Kasse architecture. Actual provider/API/legal implementation comes only after it is properly verified.
