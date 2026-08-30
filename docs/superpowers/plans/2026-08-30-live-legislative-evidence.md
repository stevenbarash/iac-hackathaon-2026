# Live Legislative Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live New York sponsorship/vote evidence and one live federal House roll-call record to official profiles without hardcoding political actions.

**Architecture:** A reviewed local manifest stores only upstream locators, topic tags, and inclusion rationale. Independent Open States and House Clerk adapters fetch live action data and exact-match stable person identifiers; an orchestrator enriches the existing live profile while isolating evidence-source failures.

**Tech Stack:** Node.js 26 ESM, built-in `fetch`, built-in Node test runner, existing dependency-free HTTP server and browser client.

**Spec:** `docs/superpowers/specs/2026-08-30-live-legislative-evidence-design.md`

## Global Constraints

- Displayed bill titles, statuses, sponsors, votes, motions, results, dates, person links, and source URLs must come from live upstream responses.
- Local data may contain only reviewed measure locators, topic tags, and inclusion rationale.
- Never fuzzy-match a politician's name; use OCD person IDs for New York and Bioguide IDs for the House.
- Never infer opposition, neutrality, or a broad issue score from missing actions.
- Upstream evidence failure must not prevent identity/contact profile rendering.
- Successful upstream responses may be cached in memory for at most ten minutes; no persistent or static political-action fallback.
- Demo data remains isolated from live evidence.
- This workspace has no Git repository, so each task ends in a review checkpoint instead of a commit.

---

## File map

- Create `src/data/issue-legislation.js`: immutable reviewed upstream locators and catalog validation.
- Create `src/services/openstates-evidence.js`: live state bill enrichment and exact OCD matching.
- Create `src/services/house-clerk-evidence.js`: live Clerk XML parsing and exact Bioguide matching.
- Create `src/services/official-evidence.js`: source routing, aggregation, coverage, cache boundary.
- Modify `src/services/live-officials.js`: request other identifiers and enrich the live profile.
- Modify `public/app.js`: render live action metadata and multiple official sources.
- Modify `openapi.json`: document live evidence and coverage shapes.
- Modify `examples/whatsapp-bot-flow.md` and `README.md`: document literal-action rendering and live source behavior.
- Create `test/issue-legislation.test.js`, `test/openstates-evidence.test.js`, `test/house-clerk-evidence.test.js`, `test/official-evidence.test.js`.
- Modify `test/live-officials.test.js`, `test/client.test.js`, and `test/contract.test.js`.

---

### Task 1: Reviewed manifest with no political outcomes

**Files:**
- Create: `src/data/issue-legislation.js`
- Test: `test/issue-legislation.test.js`

**Interfaces:**
- Produces: `CATALOG_VERSION: "ny-federal-pilot-v1"`
- Produces: `STATE_MEASURES: readonly StateMeasure[]`
- Produces: `HOUSE_MEASURES: readonly HouseMeasure[]`
- `StateMeasure = { key, provider: "openstates", jurisdiction, session, lookupId, topics, inclusionRationale }`
- `HouseMeasure = { key, provider: "house_clerk", congress, session, year, rollNumber, topics, inclusionRationale }`

- [ ] **Step 1: Write a failing manifest invariant test**

```js
import { HOUSE_MEASURES, STATE_MEASURES } from '../src/data/issue-legislation.js';

test('manifest contains locators and topics but no political outcomes', () => {
  const forbidden = ['title', 'status', 'sponsors', 'sponsorships', 'vote', 'votes', 'result', 'date', 'sourceUrl'];
  for (const measure of [...STATE_MEASURES, ...HOUSE_MEASURES]) {
    assert.ok(measure.key && measure.provider && measure.topics.length > 0);
    assert.ok(forbidden.every((field) => !Object.hasOwn(measure, field)));
  }
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node --test test/issue-legislation.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the frozen manifest**

Create catalog entries for NY `J2143`, `S7034`, `A2139`, `S7045`, `S1752` in session `2025-2026`, plus House 118th Congress, session 2, year 2024, roll 172. Freeze every object and nested topic array. Do not include any action outcome.

- [ ] **Step 4: Run the focused test**

Run: `node --test test/issue-legislation.test.js`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Verify `rg -n 'Yea|Nay|Passed|Cosponsor|Andrew|Goldman' src/data/issue-legislation.js` returns no political-action data or person-specific outcomes.

---

### Task 2: Live Open States state-evidence adapter

**Files:**
- Create: `src/services/openstates-evidence.js`
- Test: `test/openstates-evidence.test.js`

**Interfaces:**
- Consumes: `STATE_MEASURES`
- Produces: `createOpenStatesEvidenceService({ fetchImpl, apiKey, measures, timeoutMs, now })`
- Produces method: `getEvidenceForOfficial({ id }): Promise<EvidenceSourceResult>`
- `EvidenceSourceResult = { records: IssueRecord[], reviewedMeasureCount, successfulMeasureCount, failedMeasureCount }`

- [ ] **Step 1: Write failing tests for exact matching and live normalization**

Use complete Open States-shaped fixtures containing bill identity, current action, sponsorships, votes, and sources. Test these observable behaviors:

```js
const result = await service.getEvidenceForOfficial({ id: 'ocd-person/official-1' });
assert.equal(result.records[0].actionType, 'cosponsorship');
assert.equal(result.records[0].verification.matchMethod, 'ocd_person_id');
assert.equal(result.records[0].measure.title, 'Live upstream title');
assert.equal(result.records[0].sources[0].url, 'https://legislation.example/bill');
```

Add a fixture where the raw sponsor name matches but `person` is absent; assert no record is emitted. Add a vote fixture where `voter.id` matches and assert its literal option/motion/result are preserved. Add one failed measure response and assert partial counters rather than a thrown aggregate error.

- [ ] **Step 2: Run focused tests and confirm missing-module failure**

Run: `node --test test/openstates-evidence.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement minimal live fetch and normalization**

For every manifest entry, call:

```text
GET https://v3.openstates.org/bills/New%20York/2025-2026/{lookupId}
include=sponsorships&include=votes&include=actions&include=sources
X-API-KEY: server key
```

Use bounded timeout and one transient retry. Normalize only exact nested IDs. Derive `finding` from live fields, for example `Cosponsor of {live identifier}: {live title}.` or `Voted {option} on {motion}.` Use the live upstream date and sources. Set `position: "related_action"`, `verification.status: "live_official_source"`, and inject `now()` only for `retrievedAt`.

- [ ] **Step 4: Run focused tests**

Run: `node --test test/openstates-evidence.test.js`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Confirm the adapter does not import demo data and does not compare raw politician names.

---

### Task 3: Live House Clerk roll-call adapter

**Files:**
- Create: `src/services/house-clerk-evidence.js`
- Test: `test/house-clerk-evidence.test.js`

**Interfaces:**
- Consumes: `HOUSE_MEASURES`
- Produces: `createHouseClerkEvidenceService({ fetchImpl, measures, timeoutMs, now })`
- Produces method: `getEvidenceForOfficial({ bioguideId }): Promise<EvidenceSourceResult>`
- Produces helper: `parseHouseRollCallXml(xml): ParsedHouseRollCall`

- [ ] **Step 1: Write failing parser and exact-match tests**

Create a compact XML fixture with official Clerk element names: `rollcall-num`, `legis-num`, `vote-question`, `vote-result`, `action-date`, and multiple `recorded-vote` elements. Assert:

```js
const roll = parseHouseRollCallXml(xml);
assert.equal(roll.rollNumber, 172);
assert.equal(roll.legislationIdentifier, 'H R 6090');
assert.equal(roll.votes.get('G000599'), 'Yea');
```

Test that a matching Bioguide ID emits one `roll_call_vote` record and a different ID emits none. Test a procedural question and assert the exact question remains unchanged rather than becoming `final passage`.

- [ ] **Step 2: Run focused tests and confirm missing-module failure**

Run: `node --test test/house-clerk-evidence.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement strict Clerk XML extraction**

Fetch `https://clerk.house.gov/evs/{year}/roll{rollNumber padded to 3 digits}.xml`. Reject non-2xx, malformed XML, or mismatched roll number. Parse only the expected Clerk tags and XML-decode text. Match `legislator name-id` exactly to `bioguideId`; never compare display names. Build title, result, date, motion, literal option, and source URL from the fetched roll.

- [ ] **Step 4: Run focused tests**

Run: `node --test test/house-clerk-evidence.test.js`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Confirm `H.R. 6090`, `Yea`, `Passed`, and the official's name do not appear as hardcoded result constants in production code; they may appear only in fixtures/assertions.

---

### Task 4: Evidence orchestration and live-profile enrichment

**Files:**
- Create: `src/services/official-evidence.js`
- Modify: `src/services/live-officials.js`
- Test: `test/official-evidence.test.js`
- Modify: `test/live-officials.test.js`

**Interfaces:**
- Consumes both adapters' `EvidenceSourceResult`.
- Produces: `createOfficialEvidenceService({ openStatesEvidence, houseClerkEvidence, cacheTtlMs, now })`
- Produces method: `getEvidenceForOfficial({ id, jurisdictionId, roleClassification, otherIdentifiers }): Promise<{ issueRecords, evidenceStatus }>`
- `otherIdentifiers` is an object such as `{ bioguide: "G000599", lis: "S..." }` normalized from Open States.

- [ ] **Step 1: Write failing routing, coverage, and cache tests**

Test that a New York state role invokes only the Open States evidence adapter. Test that a federal `lower` role with Bioguide invokes only the House adapter. Test that one failed source yields `partially_available`, all applicable success with zero matches yields `researched`, and total applicable failure yields `temporarily_unavailable`. Test that a second call within ten minutes reuses the successful result while a call after ten minutes refetches.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test test/official-evidence.test.js test/live-officials.test.js`

Expected: FAIL because orchestrator/enrichment is absent.

- [ ] **Step 3: Implement orchestrator and profile integration**

Update the Open States person detail request to include `other_identifiers`. Normalize identifiers by scheme. Construct the evidence service with the existing key and fetch implementation unless injected. After normalizing identity/contact fields, call the orchestrator and replace the current static empty live evidence status with its `issueRecords` and `evidenceStatus`.

Cache only complete successful adapter results for at most `600_000` milliseconds. Do not cache partial or failed responses. Return identity even when evidence enrichment fails.

- [ ] **Step 4: Run focused tests**

Run: `node --test test/official-evidence.test.js test/live-officials.test.js`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Inspect a normalized profile and confirm every action field traces to an adapter response while catalog coverage traces to the manifest.

---

### Task 5: API, browser, and WhatsApp contract

**Files:**
- Modify: `public/app.js`
- Modify: `openapi.json`
- Modify: `examples/whatsapp-bot-flow.md`
- Modify: `README.md`
- Modify: `test/client.test.js`
- Modify: `test/contract.test.js`

**Interfaces:**
- Consumes the enriched existing `OfficialProfile` response.
- Preserves existing route: `GET /api/v1/officials/{officialId}`.

- [ ] **Step 1: Write failing client and contract tests**

Add a live profile fixture with `actionType`, `measure`, `action`, `sources`, and `verification.status: "live_official_source"`. Assert the browser renders literal vote/sponsorship text, exact motion, date, and every official-source link. Assert no score or unsupported `supports`/`opposes` label appears. Extend contract assertions for evidence coverage enum and normalized live record fields.

- [ ] **Step 2: Run focused tests and confirm contract/UI failures**

Run: `node --test test/client.test.js test/contract.test.js`

Expected: FAIL because the live action schema and multi-source rendering are absent.

- [ ] **Step 3: Implement rendering and schemas**

Render `record.sources` when present and fall back to the demo record's singular `source`. For live records, display the literal finding and action metadata; omit the demo-only verification sentence. Update OpenAPI with `ActionType`, `Measure`, `LegislativeAction`, `LiveVerification`, and expanded `EvidenceStatus` schemas while preserving demo compatibility. Update WhatsApp documentation to copy literal actions and coverage without inference.

- [ ] **Step 4: Run focused tests**

Run: `node --test test/client.test.js test/contract.test.js`

Expected: PASS.

- [ ] **Step 5: Run complete verification**

Run:

```sh
npm test
node --check src/services/openstates-evidence.js
node --check src/services/house-clerk-evidence.js
node --check src/services/official-evidence.js
node --check src/services/live-officials.js
node --check public/app.js
```

Expected: all tests pass and all syntax checks exit zero.

- [ ] **Step 6: Live smoke test without exposing secrets**

Start with `npm start`, submit a complete Brooklyn address, and inspect two returned profiles. Confirm a state cosponsorship is fetched from Open States and the federal vote is fetched from House Clerk. Check only key presence/permissions; never print the key or upstream authorization header.

- [ ] **Step 7: Final review checkpoint**

Run a production-code scan for forbidden hardcoded outcomes and inspect the actual HTTP profile JSON for source URLs, coverage, exact identifier matches, and absence of the submitted street address.
