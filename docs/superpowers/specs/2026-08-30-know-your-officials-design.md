# Know Your Officials Design

## Product goal

Build a two-hour hackathon prototype that helps a community member identify elected officials, understand their documented record on issues affecting Jewish communities, and find a direct contact path. The same evidence API must serve the web experience and a separately built WhatsApp bot.

## Scope

The prototype is a clearly labeled New York pilot using illustrative seed data. It does not assert facts about real people. A later data-research pass can replace the seed records without changing either client because all clients consume the same versioned API.

The prototype includes:

- A short, account-free address onboarding flow.
- Address confirmation and transparent pilot-coverage messaging.
- Three official cards spanning federal and state offices.
- Official profiles with responsibilities, contact information, issue records, evidence metadata, and verification status.
- A stateless JSON API designed for both the website and a WhatsApp webhook service.
- An OpenAPI document, health endpoint, sample requests, and typed error responses.

The prototype excludes live political research, automated position inference, user accounts, a database, outbound messaging, maps, nationwide coverage, and an aggregate political score.

## User experience

The landing screen states the value proposition before asking for information. The user enters a full home address or selects a demo address. The product explains that the address is used only to resolve districts and is not stored.

After resolution, the product confirms only city and state, explains that pilot coverage is illustrative, and presents the officials. Selecting an official opens a focused profile. The user can filter the evidence record by topic and follow an official contact link. Missing records are displayed as missing rather than interpreted as opposition.

The WhatsApp flow mirrors these states: welcome, address request, location confirmation, numbered official selection, topic selection, evidence response, and contact or navigation options. The bot owns conversation state but does not own civic-data or political-classification logic.

## Architecture

A dependency-free Node.js HTTP server serves both the static web application and a versioned JSON API. Domain data and lookup logic are isolated from HTTP transport so a future database or civic-data adapter can replace the seed data without changing API response shapes.

Files are split by responsibility:

- `src/data/officials.js` contains illustrative pilot records.
- `src/domain/officials.js` validates addresses, resolves pilot coverage, and retrieves official profiles.
- `src/http/respond.js` owns JSON response and request-body helpers.
- `server.js` routes API and static-file requests.
- `public/` contains the channel-specific web presentation.
- `openapi.json` is the bot teammate's machine-readable contract.
- `test/` verifies domain and HTTP behavior with Node's built-in test runner.

## API contract

`GET /api/health` returns service status and API version.

`POST /api/v1/officials/lookup` accepts `{ "address": string, "topics"?: string[], "locale"?: string }`. It returns a request identifier, pilot coverage, normalized non-street location, district labels, and compact official cards.

`GET /api/v1/officials/{officialId}` returns one complete official profile with responsibilities, contact information, and issue evidence.

`GET /api/openapi.json` returns the API contract.

Errors use HTTP status codes and `{ "error": { "code", "message", "suggestions"? } }`. The current runtime emits `INVALID_JSON`, `INVALID_REQUEST_BODY`, `PAYLOAD_TOO_LARGE`, `ADDRESS_REQUIRED`, `OUTSIDE_PILOT_COVERAGE`, `INVALID_TOPIC`, `INVALID_LOCALE`, `INVALID_OFFICIAL_ID`, `OFFICIAL_NOT_FOUND`, `METHOD_NOT_ALLOWED`, `ROUTE_NOT_FOUND`, and `INTERNAL_ERROR`. `ADDRESS_NOT_FOUND` and `ADDRESS_AMBIGUOUS` remain reserved in the shared error enum for a future address adapter; the current pilot matcher does not emit them.

## Evidence rules

Topic identifiers are `ihra`, `bds_policy`, `israel_legislation`, `antisemitism`, and `jewish_community`. Position identifiers are `supports`, `opposes`, `mixed`, `related_action`, and `no_documented_position`.

Every substantive issue record contains a dated finding, evidence type, source object, and verification object. Illustrative records are labeled `demo_only` in both the API and interface. The UI never converts evidence into an overall score and never describes BDS as categorically legal or illegal.

## Privacy and safety

The prototype does not persist addresses, phone numbers, sessions, or message content. API responses never echo a full street address. The server sets defensive content-type headers and limits JSON request size. The API is stateless so the WhatsApp teammate can keep channel identifiers and conversation state outside the civic-data service.

## Error handling

Empty or malformed addresses return actionable client errors. Addresses outside the pilot return an explicit coverage error and a demo-address suggestion. Unknown official identifiers return a stable not-found response. Unexpected server errors return a generic response without leaking stack traces.

The web interface keeps the user's entered address available locally for correction, announces loading and error states, and never shows an empty result without explanation.

## Verification

Domain tests cover accepted demo addresses, rejection of false-positive Brooklyn matches, redaction of street details, out-of-coverage behavior, topic filtering, data invariants, and unknown official identifiers. HTTP and web regression tests cover the health endpoint, lookup endpoint, profile endpoint, OpenAPI document, malformed JSON, unsupported methods, strict static paths, all five topic controls, neutral absent-topic behavior, topic-chip focus restoration, and address correction in page memory. After this final fix wave, the controller will perform the actual browser and mobile-width pass for onboarding, evidence filtering, back navigation, keyboard focus, and readable source/contact actions.
