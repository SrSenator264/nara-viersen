# NARA — Project Memory

Last updated: 14 September 2026  
Project folder: `C:\Users\droma\Documents\Codex\2026-09-08\new-chat`

This is the durable hand-off note for the NARA / IUGENE restaurant ordering site. It intentionally contains **no API keys, passwords, or customer data**.

## Restaurant and delivery

- Current restaurant name: **IUGENE** (NARA concept/site).
- Restaurant address: Gereonstraße 1, 41747 Viersen.
- Early delivery radius: maximum 10 km.
- The website and payment flow are still experimental/test-only. Real payments and final launch will be connected later at once.

## Menu structure agreed by owner

The menu order should be:

1. Chicken Buckets & Deals
2. Fried Chicken
3. Korean & Fusion Wings
4. Crispyburger Bundels
5. Beef Burger
6. Chicken Burger
7. Kindergerichte
8. French Tacos
9. Sandwiches
10. Hot Dogs
11. Falafel
12. Specials
13. Salate
14. Dips
15. Frappuccino Series
16. Desserts
17. Alkoholfreie Getränke

Other menu decisions:

- Remove the separate “Extra” catalog entries where the extra choice is already inside the product options.
- Keep vegan burger, remove a broad “vegetarian” label/category where it is misleading.
- Chicken should be visually separated before other menu areas.
- Burger products are split into Beef Burger and Chicken Burger. A customer can choose burger-only or menu. When menu is selected, show the menu image and require drink/sauce selection; these choices should not be expanded by default.
- Move product imagery high in product dialogs so it remains obvious.
- The hero/header will later become an animated rotating showcase focused on crispy chicken, buckets, wings and burgers. This is a finishing touch to do after the menu is complete.
- Hide the “KI-generiert” visual label in the customer-facing site.

## Bundles and sauces

- Bundle sauces: customer receives the number of sauces included by the bundle. Additional sauces are paid and must be visible on the invoice/kitchen ticket.
- General menu rule discussed: included dips vary by item; extra paid dips must appear clearly for kitchen staff.
- Burger Bun is a €0.99 paid option with crispy meals where configured.

## Dips pricing and ordering

- Ketchup: €0.49.
- Mayonnaise: €0.49.
- All other paid dips: €1.49 unless the product configuration explicitly says otherwise.
- Keep related sauces visually beside one another (especially mayonnaise-based sauces and ketchup). Remove duplicates, including duplicate Garlic Sauce.
- Ensure item option groups include paid dips that are available in the Dips catalog but otherwise missing from the item configuration.

## Frappuccino and dessert menus

- Every Frappuccino product must let the customer choose: with cream / without cream.
- Each drink also offers a menu choice. A menu includes **two donuts**, selected by the customer.
- Donut options: White Donut, Pink Donut, Chocolate Donut, and Sprinkle Donut.
- Do not split this into two separate catalogs; the choice belongs inside each drink product.
- Desserts includes Soufflé Al Cioccolato at €4.49.
- Product images are supplied locally by the owner; do not invent replacement food images when the owner asks to provide them.

## Allergen policy

The guide must be conservative:

- It answers an allergen question only when supplier/owner-confirmed data exists.
- When an item is not confirmed, it must say so and tell the guest to contact the restaurant. It must never guess based on a recipe name.
- It must never say an item is allergen-free unless this is explicitly confirmed.

Confirmed data currently added in `allergen-data.js`:

- Burger buns: Gluten (Weizen), Milch, Sesam.
- Taco tortillas: Gluten (Weizen), Milch; no sesame stated.
- Real American Chicken Nuggets Halal: Gluten (Weizen).
- Real American Crispy Chicken Burger patty and owner-confirmed same patties: Gluten (Weizen), Soja.
- P&W Burger Dressing: Ei, Senf.
- Salomon Chilli Cheese Burger Sauce: Milch, Ei.
- EDEKA Delikatess Mayonnaise: Ei, Senf.
- EDEKA Tomato Ketchup: no declared mandatory allergen in its confirmed data; never describe this as generally “allergy-free”.
- Joppiesauce: Ei, Soja, Gluten (Weizen), Sellerie, Senf.

## AI receptionist plan

Goal: a restaurant-only “NARA Fire Guide” that behaves like a reception/order employee.

It must be able to:

- Speak naturally in Arabic and German, and stay entirely inside NARA ordering.
- Find menu products, explain real ingredients/options, calculate only listed prices, recommend suitable and cheaper combinations, and suggest legitimate add-ons/offers.
- Read the active cart and carry short conversation context.
- Explain confirmed allergen data safely.
- Never invent a product, price, allergy, availability, delivery fee, popularity claim, or discount.
- Never claim an item/option was added or changed; the customer must confirm through the product selector.
- Refuse non-restaurant topics briefly and return to ordering.

Current implementation:

- Server endpoint: `POST /api/nara-guide` in `server.js`.
- The browser sends message, preferences, short conversation history and cart summary.
- The server serialises the real menu and confirmed allergen data into a constrained system instruction.
- Rate limit: 30 guide requests per IP per hour in the local test server.
- Client has a safe local recommendation fallback if the live model is unavailable.

## AI provider status — important

- Gemini AI Studio setup was attempted. The AQ-format Google key returned `ACCESS_TOKEN_TYPE_UNSUPPORTED` from Google’s Gemini API despite direct testing. This was a Google authentication issue, not a website issue.
- Groq was selected as the free live provider instead.
- Current hosted provider/model: Groq `groq/compound-mini`.
- `qwen/qwen3.8-27b` and `qwen/qwen3.6-27b` were tested. Qwen works, but it may emit reasoning or fail strict JSON formatting in this flow.
- `groq/compound-mini` returned a clean compact JSON answer in testing and is the best free/stable choice for the current restaurant guide.
- Groq’s free published limits are more suitable for the early site than OpenRouter’s free tier (roughly 1,000 requests/day for the selected Groq models versus OpenRouter’s typical 50 free requests/day without paid credits).
- The code is prepared to prefer `GROQ_API_KEY` when available, then fall back to Gemini only if configured.
- The Groq key is configured locally and as a hosted secret. Never print it, paste it into chat, commit it, or put it in frontend code.
- `.env` must stay private and must never be committed, displayed, or copied into frontend code.

## Hosted site status

- Public-facing URL: `https://nara-viersen.dromar2088.chatgpt.site`
- Sites project id: `appgprj_6aa10db2577c8191983dc23289653109`
- Active deployment checkout: `C:\Users\droma\Documents\Codex\2026-09-08\new-chat\nara-worker-deploy`
- Current hosted runtime variables:
  - `GROQ_API_KEY`: secret
  - `GROQ_MODEL`: `groq/compound-mini`
- Latest successful deployment fixed the Live Guide fallback issue caused by Groq JSON/model handling.
- The site may still be owner-private unless access is explicitly changed. Do not make it public without owner approval.

## Codex usage-saving rules

To keep the project affordable and avoid burning usage:

- Use GPT-5.6 Luna / Light for menu data entry, wording, ordering, small CSS edits, and simple checks.
- Use GPT-5.6 Terra for normal implementation, debugging, and deployment.
- Use Astra only for heavy architecture, difficult AI behavior, large refactors, or stubborn bugs after Terra fails.
- Keep each new task short and focused: one section, one bug, or one feature at a time.
- Paste only the new information needed for the current change; avoid re-sending the whole menu or many screenshots when the saved file already contains context.
- Prefer local saved notes over long chat history. Start a fresh task with: “Read `NARA_PROJECT_HANDOFF.md` first, then continue with ...”
- Do not ask Codex to re-review the entire project unless needed; targeted file reads and targeted edits are much cheaper.

## Current files

- `index.html` — customer website shell and dialogs.
- `app.js` — cart, menu selections, local guide fallback and live guide call.
- `catalog.js`, `menu-source.js` — menu data.
- `allergen-data.js` — confirmed allergen registry.
- `nara.css`, `customer-updates.css` — customer-facing styling.
- `server.js` — local static server plus safe AI proxy.
- `outputs/nara/` and `dist/` — copies served/previewed by the local project.

When `app.js` or `allergen-data.js` is changed, sync the output copies:

```powershell
Copy-Item -LiteralPath 'app.js' -Destination 'dist\app.js' -Force
Copy-Item -LiteralPath 'app.js' -Destination 'outputs\nara\app.js' -Force
Copy-Item -LiteralPath 'allergen-data.js' -Destination 'dist\allergen-data.js' -Force
Copy-Item -LiteralPath 'allergen-data.js' -Destination 'outputs\nara\allergen-data.js' -Force
```

## Verification

Run these after edits:

```powershell
node --check app.js
node --check server.js
node work\verify.cjs
```

The existing verification suite currently reports passed checks for French Tacos, regular/extra pricing, optional dessert/drink/extras, unavailable desserts, deposit scaling, editing, and kitchen summary.

## Next immediate step

1. Test the live guide with simple customer prompts: “بدي تاكو”, “شو بتنصحني برغر دجاج؟”, “عندي حساسية من السمسم”.
2. Continue menu/image finishing in small batches.
3. Later, consider adding Gemini as a backup provider if the free tier remains reliable.
4. Before launch, review checkout/order confirmation, address validation, tax/fiscal flow, privacy text, and real payment mode.

## Memory update — 30 September 2026

The durable project direction is confirmed: NARA is being developed as an integrated restaurant operating system for IUGENE, not only as a customer ordering page. Completed foundations include the customer menu/cart flow, multilingual UI (DE/AR/EN), product options and paid dips, invoice/document review workflow, supplier/article mapping, package-to-inventory unit conversion, local OCR plus controlled AI fallback, draft safety, inventory posting only after validated Wareneingang, initial Kasse architecture, structural/DOM verification, and the owner-facing NARA Fire Guide with safe menu/allergen behavior.

The long-term vision is one controlled NARA platform covering orders, Kasse/payment/TSE, menu, invoices, suppliers, inventory, recipes and costing, employees/shifts/labor, vehicles/delivery, purchasing optimization, accounting/reporting, marketing, and eventually multiple restaurants. The owner-facing NARA AI Manager should read live structured data, analyze it, and propose decisions while requiring explicit confirmation for sensitive or irreversible actions. It remains distinct from the customer-facing NARA AI Sales Agent.

The future operating model is a central NARA Manager connected directly to the live restaurant system and a group of specialized agents. Each bounded agent owns one area and reports structured findings to the manager: accounting/finance, purchasing, inventory and suppliers, marketing/advertising, photography/content, orders/sales, delivery/vehicles, employees/shifts, recipes/costing, and reporting. These agents must use controlled internal interfaces, respect restaurant rules, preserve decision history, and escalate sensitive actions for Omar's confirmation.

The intended daily loop is: each specialist reviews its domain and records what happened, anomalies, risks, opportunities, and recommended actions. The NARA Manager combines the sections into one daily briefing for Omar covering sales, costs, profit signals, stock risks, purchasing needs, employee and delivery issues, marketing performance, what to do next, and what can be postponed or stopped. Omar and the NARA Manager then discuss priorities and decisions. This daily multi-agent manager layer is a future architecture and product direction, not yet implemented.

The complete restaurant-program vision also includes table service and staff attribution: table numbers, open table sessions, orders assigned to the responsible employee, staff sales/void/tip reporting, occupancy and guest-count reporting, and one central view for in-house, take-away, own delivery, and external platform orders. Future camera integration may use Tapo cameras from TP-Link for occupancy/guest-count signals and operational context. Employee identification by face must remain subject to German/EU privacy and biometric-data review; the safer initial identity mechanism is PIN, badge, or QR, with camera analytics separated from employee identity until legally approved.

## Global NARA platform vision

The long-term ambition is a multilingual, multi-branch, internationally scalable NARA platform for restaurants. It should help Omar decide when and where to open branches, compare branch performance, assign branch managers, standardize recipes and operations, and see the complete financial and operational picture across the group.

Planned future capabilities include own delivery strategy (including evaluating electric vehicles, drivers, routes, and alternatives to owning a fleet), delivery-platform comparison, WhatsApp ordering, mobile app growth, referral and download incentives, targeted discounts and offers, social-media campaigns, advertising, photo and video production, multilingual customer communication, and branch-level staff and manager control.

The agent ecosystem should eventually include dedicated agents for photography, video, social media, advertising, customer acquisition/app growth, WhatsApp orders, delivery and fleet planning, purchasing, waste and low-demand analysis, accounting, employees, branch management, recipes/costing, and executive reporting. A key management function is to identify products or materials that consume money but generate little demand or profit, then recommend reducing, changing, promoting, or removing them after Omar's review. NARA should continuously surface what is missing, what is wasteful, what is profitable, and what deserves investment.

This is a staged vision: first prove one restaurant and one safe operational core, then add branches, agents, and external channels without weakening data ownership, approvals, privacy, fiscal compliance, or financial controls.

## Owner companion and customer voice agent vision

Omar wants NARA to become a daily business partner, not only a dashboard. The owner-facing NARA Manager should be available through natural voice or chat, understand the full restaurant context, and hold a morning management conversation: what happened yesterday, money received and owed, upcoming payments, unpaid or aging supplier invoices, purchasing needs, employee issues, delivery performance, marketing results, and recommended priorities. It should remember decisions and follow up on them.

This owner companion must remain separate from the customer-facing voice sales/reception agent. The customer agent should sound like a real restaurant receptionist: greet guests naturally, explain the real menu, ask what they prefer, recommend legitimate combinations, explain when a menu is cheaper, suggest a drink or add-on when appropriate, answer confirmed allergen questions safely, understand German and Arabic, read the active cart, and guide the customer to confirm the order in NARA. It must never invent products/prices, silently change the cart, or claim an order is placed without confirmation.

The owner companion may later read connected emails, supplier messages, platform reports, invoices, and bank feeds through controlled integrations. Initial bank and email access should be read-only. It can identify incoming payments, upcoming liabilities, overdue invoices, and likely cash-flow risks, then prepare a payment proposal. It must require Omar's explicit confirmation before transfers, payments, external messages, price changes, promotions, purchases, deletion, fiscal actions, or other irreversible effects. It should never receive unrestricted bank mutation access.

Omar also wants proactive remote management: NARA should regularly remind him of the global vision, notice missing capabilities, and suggest additional legal business improvements without waiting for a question. A future tax/compliance agent may analyze structured financial data and propose lawful options such as VAT/tax treatment questions, deductible business expenses, vehicle and equipment comparisons, purchasing structures, branch timing, and financing scenarios. It must not promise tax savings, encourage evasion, or replace a licensed German Steuerberater; every material tax/legal recommendation must be clearly marked as a proposal requiring professional validation.

The future finance and expansion layer should provide read-only bank visibility, cash-flow forecasts, income/outgoing summaries, payment deadlines, supplier liabilities, financing or loan scenarios, branch break-even estimates, and go/no-go recommendations for opening the next location. It may prepare decision packages for Omar, but no bank transfer, loan application, tax filing, contract, or external commitment may be executed without explicit approval and appropriate human/professional review.

## Proposed differentiator: NARA Restaurant Twin

The first major new product idea is a live "Restaurant Twin": a structured digital model of each restaurant, branch, menu, staff pattern, supplier cost, delivery channel, cash flow, and customer behavior. Before Omar changes a price, adds a product, buys a vehicle, launches an offer, hires staff, or opens a branch, NARA can simulate scenarios and show expected sales, margin, labor, stock, delivery, cash-flow, and risk effects. It should explain assumptions, show best/base/worst cases, and recommend a small reversible test before a large commitment.

The Twin becomes distinctive when connected to the customer voice agent and specialist agents: customer questions and rejected recommendations reveal demand signals; purchasing and inventory reveal cost pressure; accounting reveals real margin; delivery reveals route economics; marketing reveals campaign results; and branch data improves the next forecast. NARA would not only report what happened but maintain a decision memory of what was tried, why, what it cost, and what actually happened. This is a proposed differentiator to validate in the market, not a claim that no similar component exists anywhere.

Current verified issue: the real browser page and invoice review DOM load correctly, and the DOM contract tests pass. A two-page invoice extraction test can spend about 77 seconds in local Paddle OCR before safely returning review-required because the pages contain different invoices. This is the next technical focus; do not change Kasse, TSE, Gemini, or business data while diagnosing it. `work/verify.cjs` currently also has an unrelated mock-environment failure because `localStorage` is undefined.
