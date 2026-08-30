# Know Your Officials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable New York pilot with account-free web onboarding and a stable evidence API that a WhatsApp bot can consume.

**Architecture:** A dependency-free Node.js HTTP server exposes versioned JSON endpoints and serves a static responsive web client. Domain lookup and evidence data remain transport-independent, and the API returns only illustrative records explicitly marked as demo data.

**Tech Stack:** Node.js 26, Node built-in HTTP server, ECMAScript modules, Node built-in test runner, semantic HTML, CSS, browser JavaScript, OpenAPI 3.1.

**Spec:** `docs/superpowers/specs/2026-08-30-know-your-officials-design.md`

## Global Constraints

- Keep the project dependency-free and runnable with Node.js 26.
- Treat every file under `sources/` as read-only.
- Do not assert political facts about real people; seed records must be explicitly illustrative.
- Do not persist or echo full street addresses.
- Both web and WhatsApp clients must receive political findings from the same `/api/v1` contract.
- Every substantive issue record must contain evidence and verification metadata.

---

### Task 1: Domain model and pilot lookup

**Files:**
- Create: `package.json`
- Create: `src/data/officials.js`
- Create: `src/domain/officials.js`
- Test: `test/domain.test.js`

**Interfaces:**
- Produces: `lookupOfficials({ address, topics, locale })`, `getOfficialById(id)`, `TOPICS`, and `DomainError`.
- `lookupOfficials` returns `{ requestId, coverage, location, officials }` without the street portion of the submitted address.
- `getOfficialById` returns a complete cloned official record or throws `DomainError('OFFICIAL_NOT_FOUND', ..., 404)`.

- [ ] **Step 1: Write failing domain tests**

Create tests asserting that a Brooklyn demo address returns three compact officials, location contains only city/state/districts, `topics: ['ihra']` limits record counts, an empty address raises `ADDRESS_REQUIRED`, an unsupported address raises `OUTSIDE_PILOT_COVERAGE`, and an unknown official raises `OFFICIAL_NOT_FOUND`.

- [ ] **Step 2: Run the domain tests and verify failure**

Run: `node --test test/domain.test.js`

Expected: FAIL because `src/domain/officials.js` does not exist.

- [ ] **Step 3: Implement seed data and domain functions**

Create three fictional New York pilot officials with unique stable IDs, offices, districts, responsibilities, contact objects, and illustrative issue records. Every issue record must set `verification.status` to `demo_only` and every source must use a non-deceptive demo URL under `example.org`.

Implement address validation, Brooklyn/11201 pilot recognition, topic validation, compact-card mapping, defensive cloning, non-street location output, and typed errors.

- [ ] **Step 4: Run domain tests**

Run: `npm test -- --test-name-pattern=domain`

Expected: all domain tests pass.

### Task 2: HTTP API and OpenAPI contract

**Files:**
- Create: `src/http/respond.js`
- Create: `server.js`
- Create: `openapi.json`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `lookupOfficials`, `getOfficialById`, and `DomainError` from `src/domain/officials.js`.
- Produces: `createAppServer()` and HTTP routes `GET /api/health`, `POST /api/v1/officials/lookup`, `GET /api/v1/officials/{id}`, and `GET /api/openapi.json`.

- [ ] **Step 1: Write failing HTTP tests**

Create a server on an ephemeral port and assert health response shape, successful lookup, successful profile retrieval, OpenAPI delivery, malformed-JSON handling, unsupported-method handling, and unknown-official handling.

- [ ] **Step 2: Run HTTP tests and verify failure**

Run: `node --test test/api.test.js`

Expected: FAIL because `server.js` does not exist.

- [ ] **Step 3: Implement request and response helpers**

Implement `sendJson`, `sendError`, and `readJsonBody` with a 32 KB body limit, JSON content type, `nosniff`, no-store API caching, and typed invalid-JSON errors.

- [ ] **Step 4: Implement routes and contract**

Implement exact route and method matching, translate `DomainError.status` to HTTP status, hide unexpected error details, and export `createAppServer`. Document the same request, response, enum, and error shapes in OpenAPI 3.1.

- [ ] **Step 5: Run API and domain tests**

Run: `npm test`

Expected: all tests pass.

### Task 3: Responsive onboarding and official profiles

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Modify: `server.js`
- Test: `test/static.test.js`

**Interfaces:**
- Consumes: `POST /api/v1/officials/lookup` and `GET /api/v1/officials/{id}`.
- Produces: a single-page flow with states `welcome`, `loading`, `officials`, `profile`, and `error`.

- [ ] **Step 1: Write failing static-delivery tests**

Assert that `/` returns semantic HTML containing the product name and address form, `/styles.css` returns CSS, `/app.js` returns JavaScript, and nonexistent assets return 404.

- [ ] **Step 2: Run static tests and verify failure**

Run: `node --test test/static.test.js`

Expected: FAIL because the public files do not exist.

- [ ] **Step 3: Build accessible onboarding markup and styles**

Build a mobile-first landing state with a value proposition, full-address label, privacy copy, submit action, and demo-address action. Add a persistent pilot-data banner, live status region, keyboard-visible focus, responsive official-card grid, topic chips, evidence cards, contact actions, and reduced-motion support.

- [ ] **Step 4: Implement browser state and API integration**

Implement address submission, demo-address insertion, location confirmation, official selection, topic filtering, profile back navigation, loading/error announcements, and safe DOM rendering with text nodes rather than untrusted HTML.

- [ ] **Step 5: Add static routing and run tests**

Serve only allow-listed public assets with correct content types and path traversal protection.

Run: `npm test`

Expected: all tests pass.

### Task 4: WhatsApp handoff and end-to-end verification

**Files:**
- Create: `README.md`
- Create: `examples/whatsapp-bot-flow.md`
- Test: `test/contract.test.js`

**Interfaces:**
- Consumes: public `/api/v1` endpoints and `openapi.json`.
- Produces: copyable teammate setup instructions, sample requests, response-to-message mappings, and contract parity tests.

- [ ] **Step 1: Write failing contract tests**

Assert OpenAPI includes all live endpoints, topic and position enums, the lookup request schema, the official-detail schema, and declared error responses.

- [ ] **Step 2: Run contract tests and verify failure if documentation is incomplete**

Run: `node --test test/contract.test.js`

Expected: FAIL until the OpenAPI document matches the live routes and response fields.

- [ ] **Step 3: Complete teammate documentation**

Document installation, local start, test commands, demo address, API examples, typed errors, curl commands, and the rule that the bot owns conversation state while the API owns civic evidence. Include the WhatsApp sequence: welcome, address, confirmation, official selection, topic selection, evidence, contact/navigation.

- [ ] **Step 4: Verify the full project**

Run: `npm test`

Run: `node --check server.js && node --check public/app.js`

Start the server and verify `GET /api/health`, demo lookup, profile retrieval, `/api/openapi.json`, and `/` manually.

Expected: every automated test passes, syntax checks pass, API responses contain no submitted street address, and the web journey completes from welcome to contact action.
