# Public website inquiry API

`POST /api/website/inquiries` accepts JSON without authentication:

```json
{
  "type": "CONTACT",
  "name": "Tên người liên hệ",
  "email": "name@example.com",
  "company": "Tên xưởng (không bắt buộc)",
  "phone": "+84 901 234 567",
  "message": "Nội dung yêu cầu tối thiểu 10 ký tự.",
  "consent": true
}
```

- Types: `DEMO`, `CONTACT`, `IMPLEMENTATION`.
- Name 2–120 characters, email at most 254 characters, optional company at most 160.
- Phone optional; if present, at most 32 formatting characters containing 7–15 digits.
- Message 10–3000 characters. Consent must be boolean `true`.
- Request JSON is limited to 16 KB. At most 10 attempts per IP per 15 minutes, including invalid submissions. Rate limit is process-local and uses Express's configured client IP, not an untrusted body/header value.

HTTP 201:

```json
{
  "ok": true,
  "reference": "FW-7F6D864B-B01E-4DCA-A2DE-123456789ABC",
  "receivedAt": "2026-11-11T07:00:00.000Z",
  "message": "Yêu cầu đã được ghi nhận."
}
```

HTTP 400 returns `{error, fields:{field:message}}`; HTTP 429 returns `{error}` with `Retry-After`; oversized JSON returns 413. A server/database failure never returns a success reference.

Storage: dedicated PostgreSQL `website_inquiries`. No workshop id, financial record, demo tenant, outbound email, public lead-list endpoint or public reference-lookup endpoint is involved. Reference is only a receipt identifier, not a publicly readable tracking link. Initialization is repeatable and runs after the existing database initializer, before listen.

## Verification

Pure validation/rate-limit checks:

```text
node --test qa-results/website/test-inquiries.mjs
```

Real HTTP + PostgreSQL verification: configure standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` for an isolated QA database, set `RUN_WEBSITE_DB_TEST=true`, then run the same command. The test refuses database names outside `finworkshop_qa_*` / `finworkshop_website_test*`. It starts only a temporary module test server on an ephemeral loopback port; it does not restart the application API or consume its rate-limit budget.

The integration test retains four clearly labeled `QA-WEBSITE-*` requests for SQL inspection and writes a sanitized result file. It checks all three types, parameterized literal text, rejection without insertion, consent, body limit, no public list/detail, financial record count unchanged, and visibility from a second SQL connection.
