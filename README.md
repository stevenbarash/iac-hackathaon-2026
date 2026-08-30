# Know Your Officials

Know Your Officials is a small, stateless civic-information API with a browser interface. Live mode geocodes a U.S. address and returns current federal and state-legislative identities from Open States.

Live profiles may include literal sponsorship, cosponsorship, and roll-call-vote actions from a configured catalog of official sources. These records report what the source says—including the measure, exact action or motion, an action date when the upstream action supplies one, and source links—and do not infer support, opposition, or an issue score. Sponsorship records do not borrow the bill's latest-action date. The coverage status says whether the applicable catalog was `researched`, `partially_available`, `temporarily_unavailable`, or `not_researched`. Demo mode remains entirely fictional.

## Run locally

Requirements: Node.js 26 or newer. The project has no package dependencies.

The server's configured Open States key is the default, so the browser works without user setup. To supply a different server default through the environment, this zsh sequence avoids putting it directly in command history:

```sh
read -s "OPENSTATES_API_KEY?Open States API key: "
export OPENSTATES_API_KEY
echo
npm start
```

Never put a key in source control, URLs, JSON bodies, or logs. The browser's settings gear accepts an optional user key, keeps it only in `sessionStorage`, and sends it to this server in the `X-OpenStates-API-Key` request header. The server uses that key for the request or falls back to its configured default, then authenticates to Open States using Open States' `X-API-KEY` header.

The default URL is [http://localhost:3000](http://localhost:3000). Start typing a U.S. street address and choose a result from the keyboard-accessible dropdown, or finish entering it manually. Use the settings gear at the top right only when you want to override the default Open States key for the current browser tab. Choose **Use demo location** for fictional records. Demo mode works without transmitting an Open States key.

Run all tests with:

```sh
npm test
```

The machine-readable contract is available at [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json).

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Service status and API version. |
| `/api/v1/addresses/suggest` | `GET` | Return U.S. house-address suggestions from Photon. |
| `/api/v1/officials/lookup` | `POST` | Resolve live or demo official cards from an address. |
| `/api/v1/officials/{officialId}` | `GET` | Retrieve identity, contacts, source attribution, and evidence status. |
| `/api/openapi.json` | `GET` | Return the OpenAPI 3.1 contract. |

### Lookup

`address` is required. Live addresses must include a 5-digit ZIP because the Census endpoint can be slow or ambiguous without one. `mode` is optional and defaults to `live`; the other value is `demo`. `topics` is an optional array of these stable keys: `ihra`, `bds_policy`, `israel_legislation`, `antisemitism`, and `jewish_community`. `locale` is an optional client hint.

Live consumers may send `X-OpenStates-API-Key` on lookup and profile requests. When it is omitted or blank, the server uses its configured default. The header is ignored by demo resolution.

Live request:

```sh
curl -sS http://localhost:3000/api/v1/officials/lookup \
  -H 'content-type: application/json' \
  -X POST \
  --data '{"address":"350 Fifth Avenue, New York, NY 10118","topics":["ihra"],"locale":"en-US"}'
```

The response contains non-street location data and compact cards. The lookup response itself retains `evidenceStatus: "not_researched"` with `documentedRecordCount: 0` because official-source evidence is fetched only from the profile endpoint. The browser prefetches those profiles and uses their current evidence status and record count on its compact cards. Other consumers can use a card's URL-encoded ID to retrieve the same profile. Live profile records use `actionType`, `measure`, `action`, `sources`, and `verification.status: "live_official_source"`. Consumers must present those fields literally and must not convert a vote or sponsorship into `supports`, `opposes`, or a score.

Fictional demo request:

```sh
curl -sS http://localhost:3000/api/v1/officials/lookup \
  -H 'content-type: application/json' \
  -X POST \
  --data '{"address":"Brooklyn, NY 11201","mode":"demo"}'
```

Demo profiles contain fictional issue records. Every such record has a topic key, position enum, finding, source, and `demo_only` verification metadata.

### Errors

All API errors use one envelope:

```json
{"error":{"code":"ERROR_CODE","message":"Human-readable explanation"}}
```

| HTTP status | Error codes | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON`, `INVALID_REQUEST_BODY`, `ADDRESS_REQUIRED`, `INVALID_TOPIC`, `INVALID_LOCALE`, `INVALID_LOOKUP_MODE`, `INVALID_OFFICIAL_ID` | The request cannot be interpreted or needs a corrected value. |
| 404 | `ADDRESS_NOT_FOUND`, `OFFICIALS_NOT_FOUND`, `OFFICIAL_NOT_FOUND`, `ROUTE_NOT_FOUND` | The address, location coverage, official, or route was not found. |
| 405 | `METHOD_NOT_ALLOWED` | The route exists but does not support the method; inspect the `Allow` header. |
| 413 | `PAYLOAD_TOO_LARGE` | The JSON body exceeds 32 KiB. |
| 422 | `ADDRESS_AMBIGUOUS`, `OUTSIDE_PILOT_COVERAGE` | The live address needs more detail, or a demo address is outside pilot coverage. |
| 503 | `CONFIGURATION_REQUIRED`, `UPSTREAM_SERVICE_UNAVAILABLE` | The server needs an Open States key or a civic-data provider is temporarily unavailable. |
| 500 | `INTERNAL_ERROR` | An unexpected failure occurred without exposing implementation details. |

## Privacy and integration boundary

While the user types, the server sends the current address text to Photon's public OpenStreetMap-based service to retrieve dropdown suggestions. This service does not persist the query. In live mode, the server sends the final submitted address to the U.S. Census Geocoder. If Census remains unavailable after a retry, the server sends the address to Photon and accepts only a U.S. house result with the submitted ZIP. It does not persist the address or echo it in a response. It sends only the resulting latitude and longitude to Open States. A user-provided API key remains in the browser tab's `sessionStorage`, is transmitted to this server only in a request header, and is never returned in an API response. In demo mode, the input is matched locally and neither the address nor a user key is sent upstream.

The API owns civic evidence and illustrative official profiles only. Client-specific identity, consent, and session state do not belong in this service.

## Current coverage boundary

Open States supplies U.S. Congress and state-legislative identities for a coordinate. This integration does not claim to resolve governors, mayors, county officials, or every local office. Evidence coverage applies only to the configured measure catalog: an empty researched result means no matching action was found in that catalog, not opposition or neutrality. Partial or unavailable coverage is reported explicitly.
