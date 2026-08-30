# WhatsApp bot handoff

## Boundary

The Meta webhook adapter is the WhatsApp-facing component. It validates and responds to webhook events, owns user phone numbers and conversation state, and renders API responses as messages. Know Your Officials is a stateless HTTP API: it accepts a lookup request or stable official ID and returns civic identity and evidence-status data only. The bot calls this API; it never receives or stores the Open States key.

Never place Meta credentials, user phone numbers, webhook payloads, or conversation state in this API or its requests.

## Adapter configuration and state

Configure the adapter with `CIVIC_EVIDENCE_API_BASE_URL`; do not hard-code a deployment host. Configure a finite request timeout such as `CIVIC_EVIDENCE_API_TIMEOUT_MS=5000`. The adapter must reject invalid base URLs at startup and must never put Meta credentials or channel identifiers in API URLs, headers, or bodies.

Keep one short-lived record per WhatsApp conversation in the bot adapter's own TTL-backed store:

```js
{
  stage: 'awaiting_address',
  officialIds: [], // ordered exactly as the displayed numbered list
  selectedOfficialId: null,
  selectedTopic: null
}
```

The required fields are `stage`, ordered `officialIds`, `selectedOfficialId`, and `selectedTopic`. This is channel-side conversation state. It belongs to the bot adapter and must never be stored in, or sent to, the stateless civic-evidence API.

## One numbered-text mechanism

1. **Welcome** — explain that official identities can be live while issue evidence may be unresearched; offer live lookup or a fictional demo.
2. **Address request** — ask for a full U.S. address. Disclose that the API sends it to the U.S. Census Geocoder without storing it, then sends only coordinates to Open States. Offer the demo as a separate action.
3. **Confirmation** — show only a normalized city/state or coverage prompt; never repeat a full street address.
4. **Official selection** — set `officialIds = lookup.officials.map(({ id }) => id)` and render the cards as `1`, `2`, `3`, in that same order. This ordered array is the adapter's `orderedOfficialIds` for the selection step: a numeric reply `n` resolves only as `officialIds[n - 1]`. Reject non-integers and out-of-range numbers without changing state. Store the resolved stable ID in `selectedOfficialId`; names are display text, never API identifiers.
5. **Topic selection** — render one fixed ordered list: `1 ihra`, `2 bds_policy`, `3 israel_legislation`, `4 antisemitism`, `5 jewish_community`. Resolve a numeric reply through that ordered key list and store the key in `selectedTopic`.
6. **Evidence** — retrieve the selected profile. If `evidenceStatus.status` is `not_researched`, say so and do not infer a position. Otherwise render the fictional demo finding, source link, and verification note exactly as returned.
7. **Contact/navigation** — show the profile's official website, email, phone, and office address; provide a link or platform-native navigation action if available.

Each accepted reply advances `stage` exactly once. A user can send `back` to return to the preceding numbered list; rebuilding a list must also replace the corresponding ordered IDs or keys. Do not derive identity from a name or substitute free-text political labels for API keys.

## Requests and message mappings

### Resolve a location

```http
POST /api/v1/officials/lookup
Content-Type: application/json

{"address":"350 Fifth Avenue, New York, NY 10118","topics":["ihra"],"locale":"en-US","mode":"live"}
```

Representative result shape:

```json
{
  "coverage":{"status":"live_identity","message":"Official identity and district data comes from Open States. Israel and Jewish-community issue evidence has not been researched yet."},
  "location":{"city":"New York","state":"NY","districts":["..."]},
  "officials":[{"id":"ocd-person/...","name":"...","office":"...","district":"...","documentedRecordCount":0,"dataMode":"live_identity","evidenceStatus":"not_researched"}]
}
```

Message mapping: “I found current official identities for New York, NY through Open States. Issue evidence has not been researched yet. Reply with a number: 1. …” Render every returned card in array order, then store that exact array's IDs in `officialIds` before setting `stage = 'awaiting_official_number'`.

For the fictional path, send `{"address":"Brooklyn, NY 11201","mode":"demo"}` and label every identity and finding as illustrative.

### Retrieve evidence and contact information

```http
GET /api/v1/officials/ocd-person%2F...
```

Message mapping: check `evidenceStatus` before reading `issueRecords`. For `not_researched`, say “Issue evidence has not been researched for this official yet.” Never convert an empty array into support, opposition, or neutrality. For a demo record, render `finding`, `position`, `source.title`, `source.url`, and `verification.note`. Then offer only non-empty contact fields.

The bot must not generate, infer, summarize more strongly, or otherwise strengthen a political conclusion beyond the API's documented finding and metadata. If a topic has no returned evidence, say: “No displayed documented record for this topic.” Absence is not opposition and is not an affirmative `no_documented_position` record.

## Timeout and safe retry behavior

Every API fetch uses the configured finite timeout. Retry at most once, and only for a connection failure, timeout, or HTTP `502`, `503`, or `504`. Construct the retry from the same safe state and stable ID; never retry validation or other `4xx` responses. The lookup `POST` is read-only, but a retried response can have a new `requestId`, so the adapter must not use `requestId` as conversation identity.

Retry the API fetch before rendering or sending any political text. Mark each inbound WhatsApp event ID as processed and record the completed state transition before sending the response. A duplicate webhook delivery must reuse or suppress that completed response rather than fetch, generate, or send the political text again. The evidence message is deterministic text copied from the final API response; do not ask a language model to regenerate it on retry. If the outbound send result is ambiguous, reconcile it through adapter/provider delivery state instead of blindly sending a second copy.

## Error mapping

| API code | Bot response and next state |
| --- | --- |
| `ADDRESS_REQUIRED` | “Please send an address or `Brooklyn, NY 11201`.” Remain in address request. |
| `ADDRESS_NOT_FOUND` | “I couldn’t match that address. Please check it and try again.” Remain in address request. |
| `ADDRESS_AMBIGUOUS` | “That address needs more detail. Please include street number and ZIP code.” Remain in address request. |
| `OFFICIALS_NOT_FOUND` | “I matched the address, but no covered officials were returned for that location.” Remain in address request. |
| `OUTSIDE_PILOT_COVERAGE` | “This illustrative pilot currently supports Brooklyn addresses or ZIP code 11201.” Return to address request. |
| `INVALID_JSON` | “I couldn’t read that request. Please try again.” Retry only with a newly constructed request; do not show JSON. |
| `INVALID_REQUEST_BODY` | “That request was incomplete. Please send the address again.” Return to address request. |
| `PAYLOAD_TOO_LARGE` | “That message is too long for this lookup. Please send a shorter address.” Return to address request. |
| `OFFICIAL_NOT_FOUND` | “That official is no longer available in this pilot. Please choose from the current list.” Return to official selection. |
| `CONFIGURATION_REQUIRED` | Treat as an operator configuration fault. Do not ask the user for an API key. |
| `UPSTREAM_SERVICE_UNAVAILABLE` | “Live official data is temporarily unavailable. Try again shortly or use the fictional demo.” Preserve the last safe state. |
| `METHOD_NOT_ALLOWED` | Treat as an integration fault: log only a redacted diagnostic and show “Please try again shortly.” Do not expose a technical message. |
| `INTERNAL_ERROR` | Show “Something went wrong. Please try again shortly.” Preserve the last safe conversation state. |

For any unlisted API error, use the same generic retry message as `INTERNAL_ERROR`, avoid exposing API internals, and log a redacted diagnostic in the webhook adapter.
