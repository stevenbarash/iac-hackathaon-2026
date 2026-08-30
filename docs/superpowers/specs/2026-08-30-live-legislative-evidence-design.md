# Live Legislative Evidence: New York + One Federal House Vote

Date: 2026-08-30

## Objective

Extend Know Your Officials so a live official profile can show source-backed legislative actions relevant to the pilot taxonomy. The initial slice covers selected New York measures and one federal House roll call. The same normalized records must serve the browser and WhatsApp clients through the existing API.

The system reports literal official actions such as sponsorship, cosponsorship, and recorded vote options. It does not automatically turn those actions into a broad ideological score or infer a position from absence.

## Scope

### Included

- New York state legislators returned by the existing Open States geographic lookup.
- A reviewed manifest of New York bill and resolution identifiers.
- Live Open States bill details, sponsorships, actions, vote events, and sources.
- Federal representatives returned by Open States.
- Live House Clerk XML for H.R. 6090, 118th Congress, Roll Call 172.
- Exact identity joins using Open States OCD person IDs for New York and Bioguide IDs for the House.
- Evidence cards, explicit research coverage, citations, and WhatsApp-compatible API fields.

### Excluded

- Senate roll calls.
- Governors, mayors, county officials, and municipal measures.
- General web or social-media statement research.
- Automated issue classification from keywords alone.
- Aggregate scores, rankings, or inferred support/opposition labels.
- Persistent storage or scheduled synchronization.

## Live-data invariant

Political actions must not be hardcoded.

The local manifest may contain only:

- jurisdiction;
- session or Congress;
- chamber and measure type;
- official measure identifier;
- neutral topic tags;
- human-reviewed inclusion rationale;
- upstream locator such as a roll number.

Every bill title, current status, sponsorship, vote option, motion, result, date, person linkage, and source URL shown to a user must come from a live upstream response during the running application session. An in-memory cache may retain successful upstream responses for at most ten minutes. There is no static fallback containing political actions. If a source is unavailable, the application must say that evidence is temporarily incomplete and omit the unavailable action.

## Reviewed pilot manifest

The initial manifest contains these upstream locators:

| Jurisdiction | Session | Identifier | Topic tags |
| --- | --- | --- | --- |
| New York | 2025-2026 | J 2143 | `jewish_community` |
| New York | 2025-2026 | S 7034 | `ihra`, `antisemitism` |
| New York | 2025-2026 | A 2139 | `ihra`, `antisemitism` |
| New York | 2025-2026 | S 7045 | `ihra`, `antisemitism` |
| New York | 2025-2026 | S 1752 | `antisemitism` |
| United States | 118 | H.R. 6090 / House Roll 172 | `ihra`, `antisemitism` |

The manifest is a coverage declaration, not a claim that it contains every relevant measure. New entries require human review of an official title, summary, subject, or operative text.

## Upstream sources

### Open States v3

Use the existing server-only Open States key.

- Resolve a New York bill using `GET /bills/{jurisdiction}/{session}/{bill_id}` or the stable OCD bill endpoint.
- Request repeated includes for `sponsorships`, `votes`, `actions`, and `sources`.
- Match state sponsorship only when `sponsorship.person.id` equals the profile's `ocd-person/...` ID.
- Match a state individual vote only when `vote.voter.id` equals that OCD ID.
- Preserve unmatched raw names for diagnostics, but never use them to assert an action.
- Extend the live person request with `include=other_identifiers` to obtain the representative's Bioguide identifier.

Official contract: <https://v3.openstates.org/openapi.json>

### House Clerk

Fetch Roll Call 172 from:

`https://clerk.house.gov/evs/2024/roll172.xml`

Parse the roll metadata and each `recorded-vote`. Match a federal representative only when the Open States Bioguide identifier equals the Clerk `legislator` element's `name-id`. Display the Clerk's literal vote value and official question.

Official roll page: <https://clerk.house.gov/Votes/2024172>

## Architecture

### `issue-legislation` manifest

A small immutable module containing reviewed upstream locators, topic tags, and inclusion rationales. It contains no action results.

### Open States evidence adapter

Responsibilities:

- fetch manifest-listed New York measures;
- request sponsorship, action, vote, and source expansions;
- validate response structure;
- exact-match the selected official's OCD ID;
- emit normalized sponsorship and vote records;
- provide per-measure coverage failures without failing the identity profile.

### House Clerk evidence adapter

Responsibilities:

- fetch the manifest-listed official roll XML;
- parse roll number, Congress, session, date, question, result, legislation identifier, and member votes;
- exact-match the selected official's Bioguide ID;
- emit one normalized roll-call record when a matching member vote exists;
- reject malformed or mismatched roll documents.

### Evidence orchestrator

Responsibilities:

- determine whether a profile is a New York state legislator or federal House member;
- run only the relevant adapters;
- merge and deterministically sort records by date descending;
- calculate coverage metadata;
- isolate upstream failures so official identity and contact information still render.

### Existing profile service

The live profile service continues to own identity and contact normalization. It passes the normalized identity plus upstream identifiers to the evidence orchestrator and includes the returned evidence records and coverage in the profile response.

## Normalized evidence record

```json
{
  "topic": "ihra",
  "actionType": "roll_call_vote",
  "finding": "Voted Yea on final passage of H.R. 6090.",
  "date": "2024-05-01",
  "measure": {
    "jurisdiction": "United States",
    "session": "118",
    "identifier": "H.R. 6090",
    "title": "Antisemitism Awareness Act of 2023"
  },
  "action": {
    "option": "Yea",
    "motion": "On Passage",
    "result": "Passed"
  },
  "sources": [
    {
      "publisher": "Office of the Clerk, U.S. House of Representatives",
      "url": "https://clerk.house.gov/Votes/2024172"
    }
  ],
  "verification": {
    "status": "live_official_source",
    "matchMethod": "bioguide_id",
    "retrievedAt": "runtime ISO timestamp"
  }
}
```

Sponsorship findings use literal labels such as `Primary sponsor` and `Cosponsor`. State vote findings include the exact motion and option when Open States provides an individual vote. Procedural motions are not rewritten as final-passage votes.

## Evidence coverage

Live profiles return an evidence status object with:

- `status`: `researched`, `partially_available`, or `temporarily_unavailable`;
- `catalogVersion`: `ny-federal-pilot-v1`;
- `reviewedMeasureCount`;
- `successfulMeasureCount`;
- `failedMeasureCount`;
- `message` explaining the coverage boundary.

Zero matching actions is a successful researched result when every applicable manifest item was checked. It is not equivalent to opposition or neutrality.

## API and client behavior

- Keep the existing official profile endpoint.
- Replace live `issueRecords: []` with normalized live evidence records.
- Extend the OpenAPI schemas for action type, measure, action details, multiple sources, live verification, and coverage.
- Browser cards display literal action, measure, date, exact motion or sponsorship classification, and official-source links.
- Topic filters continue to operate on stable topic keys.
- WhatsApp renders the same literal findings without generating or strengthening conclusions.
- Demo profiles remain isolated fictional records and never mix with live evidence.

## Failure handling

- Reuse bounded upstream timeouts and one retry for transient failures.
- Treat 404 or missing manifest measures as per-measure coverage failures.
- Treat missing linked voter/sponsor IDs as `unmatched`, not as a fuzzy match.
- Never return raw upstream bodies, API keys, full submitted addresses, or internal parsing errors.
- Do not fail the entire official profile when evidence enrichment fails.
- Do not serve expired cached actions after a failed refresh; return incomplete coverage instead.

## Testing

Tests use complete captured-shape fixtures with fictionalized names and IDs, except contract constants such as public bill and roll identifiers.

Required coverage:

- manifest contains locators and tags but no action outcomes;
- Open States requests every required include;
- exact OCD sponsorship match produces a record;
- a raw-name-only sponsorship does not produce a record;
- exact nested voter ID produces a literal vote record;
- House XML parsing extracts official roll metadata and vote values;
- exact Bioguide match produces the federal record;
- a different Bioguide ID produces no record;
- procedural vote questions remain procedural;
- one source failure yields partial coverage while preserving the profile;
- all-source failure yields temporary unavailability, not invented evidence;
- browser and API render source-backed live records;
- demo data stays isolated;
- no secret or submitted street address appears in responses.

## Acceptance criteria

Using a complete Brooklyn address that resolves to the current pilot officials:

1. Andrew Gounardes's profile can show a live Open States cosponsorship record for J 2143 when Open States continues to report that linkage.
2. Dan Goldman's profile can show his live House Clerk vote on H.R. 6090 when the Clerk response continues to contain his Bioguide ID.
3. Each displayed action links to an official source and states the literal action.
4. The UI never claims a broad issue position from these records automatically.
5. Removing or corrupting an upstream response causes explicit incomplete coverage, not a static political fallback.
6. The complete automated test suite passes.
