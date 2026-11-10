# API QA - isolated local verification

Commit inspected: `399cbddfa0be540a80a3facc1c6ef0569e695068`.

No application source was edited. Tests ran against the dedicated API `http://127.0.0.1:3002/api` in a newly registered workshop `QAAPI-1794333987215`. This is not the seeded/default workshop. Evidence is `api-candidate-evidence.json`; it contains no bearer token or plaintext credential. Initial 3005 attempt stopped at registration HTTP 429 without evading the limiter.

## Confirmed findings

| ID | Suggested severity | Source | Reproduction / actual result | Expected |
|---|---|---|---|---|
| API-01 | P1 | `apps/middleware-api/src/server.js:952`; `apps/middleware-api/src/db.js:389`, `:416` | Create OUTPUT invoice total 1,000, receive and allocate 1,000 (PAID/open 0). POST `/invoices` with its existing `id`, a new code and subtotal 2,000. HTTP 201 returns the same id; old invoice is overwritten, paid resets to 0/open becomes 2,000, while original allocation still exists. | Create must not overwrite an existing identifier; updates must respect paid-document restrictions. |
| API-02 | P1 | `apps/middleware-api/src/server.js:1052`, `:1082`; `apps/middleware-api/src/operations.js:21` | PUT `/cash-accounts/:id` with `{ "balance": 9876543 }`: HTTP 200 changes balance 1,001,311 to 9,876,543, openingBalance remains 1,000,000; no balancing transaction is created. | Balance must derive from opening balance and posted money movements, not arbitrary master-record input. |
| API-03 | P2 | `apps/middleware-api/src/server.js:967-968`; `apps/middleware-api/src/db.js:448-453` | With October 2026 period locked, POST invoice with `date:"2026-10-32"` or `"not-a-date"`: both HTTP 201 and exact invalid dates persist. Valid `2026-10-27` negative control correctly returns 409. Tax period `2027-02-30` to `2027-02-31` also persists HTTP 201. | Reject non-calendar dates before storing/filtering/period checks. |
| API-04 | P2 | `apps/middleware-api/src/server.js:1006-1008` | Create cash account status INACTIVE, opening 1,000; receive payment 222 against it. HTTP 201, balance increases to 1,222 while status stays INACTIVE. | Stop new postings to inactive accounts. |
| API-05 | P2 | `apps/middleware-api/src/server.js:1005-1014` | POST payment referencing `counterpartyId:"nonexistent-qa-customer"`, amount 111: HTTP 201, invalid partner id persisted, cash movement created. | Validate partner identity, type, tenant and active status for payment. |
| API-06 | P2 | `apps/middleware-api/src/server.js:1075`; `apps/middleware-api/src/db.js:394-402` | POST two INPUT invoices with same code but different suppliers: both HTTP 201 (valid scoped business keys). PUT harmless note on the first: HTTP 409 `Số hóa đơn đã được sử dụng.` | Use same direction/party/series/code uniqueness definition in create and update. |
| API-07 | P2 | `apps/middleware-api/src/server.js:642`, `:652` (compare `:510`, `:605`) | Change password to eight chars: HTTP 200 although register/reset require 10. Change to 73 ASCII bytes: HTTP 200; both full 73-byte string and its 72-byte prefix authenticate HTTP 200, demonstrating bcrypt truncation collision. | Same 10-character / max-72-byte policy in all password flows. |

API-01 was proven within the tester's own workshop only. The route forces the authenticated workshop id and the database upsert key includes workshop_id. No cross-tenant overwrite was demonstrated or implied.

Security improvement, not a definite defect without session-revocation requirements: original JWT still authorizes GET `/auth/me` HTTP 200 after password change (`server.js:85`, `:652-661`).

## Related UI candidate corroboration

`operations.js:75-101` preserves an embedded `bom` snapshot when `bomId` is cleared. Isolated POST with `bomId:""` plus stale `bom` returned HTTP 201, kept the stale snapshot, and priced from old cost values (`costEstimate:1595`, `suggestedUnitPrice:1994`). The UI agent is verifying the actual user flow (select BOM then “Không dùng công thức”). Do not describe this as UI-verified solely from these API probes.

## Controls / non-bugs

| Probe | Result |
|---|---|
| No-auth GET `/invoices` | HTTP 401 PASS |
| Genuine locked date write | HTTP 409 PASS |
| Dashboard repeated reads | Metrics unchanged PASS |
| Current-day income 100 after cached dashboard | Revenue delta 100 PASS |
| Historical October income 100 queried in October range | Revenue delta 100 PASS |
| Same October entry queried in current November default range | Revenue delta 0 PASS |

The existing `test-workflows.js:162` cache failure is a test assumption, not a demonstrated application cache defect: the suite creates a fixed `2026-10-27` transaction but asserts the default current-month dashboard increases. `dashboard.js:20-23` correctly defaults to the current month (November at execution). Specify October range or use the current business date in that test.

## Existing integration coverage reviewed

- `test-review-fixes.js`: role restrictions, tenant isolation, invitation identity/single-use, stock controls, concurrent invoice business-key duplicates, tax method rules. Main reports 18/18 passed in isolation.
- `test-workflows.js`: money normalization, roles, tax, partner balances, payment allocations/adjustments, reversals, quotation revision, labor/stock, import/books, period locking, dashboard, offline registration. Main reports 14/15 with only the historical-date cache assertion above.
- `test-big-update.js`: seeded fixture completeness, detail financial redaction, cross-tenant detail denial.
- `test-odoo-contract.js`: mock XML-RPC contract; not executed by this agent (avoid external dependency confusion).
- `test-registration-recovery.mjs`: directly manipulates a specifically named integration DB; not run by this agent.

This is API and source QA, not a claim that every browser, export format, mail delivery or real Odoo deployment was tested.
