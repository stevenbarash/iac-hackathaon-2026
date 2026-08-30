# Know Your Officials — UI

Enter an address or ZIP code, see the elected officials who represent it, understand what they
work on, and leave with a message you can send today.

Built for **IAC EDGE NY: HACK4NY**, 30 August 2026 — track **Know Your Officials**.

**This branch is the front end only.** There is no server, no build step, no framework, no
package to install and no API key. It is HTML, CSS and three JavaScript files.

---

## Run it

Open `index.html` in a browser. That is the whole setup.

To serve it over http instead (recommended, and how it should be demoed):

```bash
cd know-your-officials
python -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/
```

Deploying is a drag-and-drop of this folder onto GitHub Pages, Netlify or any static host.

---

## The three screens

1. **Search** — one field. A street address, or a ZIP code if that is easier.
2. **Results** — every official covering that address. Each card shows at a glance whether
   there is a phone number, an email and a local district office.
3. **Official** — every published way to contact them, with **Call** and **Write to this
   office** as the two primary actions, plus folders for voting history, platform and issues,
   and upcoming meetings and hearings.

## Reading the interface

Colour carries **level of government** and nothing else: purple for federal, green for the
state upper chamber, orange for the lower chamber. Each official wears a **route bullet** — a
coloured disc holding their district number, borrowed from transit signage, which is designed
to be read at a glance by everyone.

Party is always spelled out as a word, so no colour on the page ever implies a party.

The interface is built for a very wide audience, roughly 18 to 120, with no assumed technical
skill. Two display controls sit in the header and are remembered per device:

- **Text size** — three steps, from an 18px base up to 23px. Everything is measured in `rem`,
  so the whole interface scales, not just the body copy.
- **Color** — Auto, Light or Dark. Auto follows the operating system setting.

It is keyboard navigable with a visible focus ring throughout, responds to
`prefers-reduced-motion`, and prints legibly.

---

## Files

```
index.html          markup for every screen, carrying data-copy keys instead of text
assets/copy.js      every user-visible string in the product
assets/styles.css   design system: light/dark tokens, no web fonts
assets/app.js       router, district lookup, views, message generator
data/officials.js   static roster snapshot (see below)
```

### All text lives in one file

No sentence text appears in `index.html` or `app.js`. Markup carries `data-copy` keys that are
filled from `assets/copy.js` on load, and the application reads every string from the same
object.

Copy gets edited far more often than logic, usually by someone who is not editing logic.
Keeping it in one file means a wording change is a one-line edit in a known place, the whole
product can be proof-read without reading any code, and translating it later means adding a
sibling file rather than hunting through render functions.

Strings that interpolate are functions rather than concatenation, so word order stays
adjustable — some languages cannot keep the English order.

---

## Where the data comes from

`data/officials.js` is a **static snapshot** committed as a plain file. The UI loads it
directly; nothing is fetched from a server we run.

District lookup happens in the browser against public, key-free services that send CORS
headers:

| Service | Role |
| --- | --- |
| [Census TIGERweb](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer) | The official boundary service. Answers which districts contain an exact point, so redistricting is picked up on its own. |
| [NYC Planning GeoSearch](https://geosearch.planninglabs.nyc/) | Finds and tidies up New York City street addresses. |
| [OpenStreetMap / Nominatim](https://nominatim.openstreetmap.org/) | Finds addresses outside the five boroughs. |
| [Zippopotam.us](https://api.zippopotam.us/) | Finds a ZIP code, for people who would rather not type a full address. |

The roster itself traces to [OpenStates](https://openstates.org/) and
[unitedstates.io congress-legislators](https://github.com/unitedstates/congress-legislators).
Every official's detail page carries a receipt naming its source and when it was last checked.

### On accuracy

We do not summarise voting records or claim to know an official's position on an issue. Those
summaries go stale and invite argument. The folders link straight to the authoritative record —
Congress.gov, GovTrack, the state legislature sites, Ballotpedia — so anything quoted can be
checked on the spot. A ZIP-only search is labelled *approximate*, because one ZIP can cross
several districts.

## Privacy

An address is sent only to the lookup services above, and nothing else. The last search and the
two display preferences live in `localStorage` on the user's own device. There is no analytics,
no account and no database.

---

## Known limits

- **The roster currently covers New York.** The interface, the copy and the lookup pipeline are
  written nationally — chamber names and state names come from the data rather than being
  hardcoded — but the shipped snapshot is New York, and `COVERED_STATE_FIPS` in `app.js` scopes
  the boundary lookup to match. An address outside coverage gets a clear "Not covered yet"
  screen rather than a wrong answer.
- **City council and school boards are not included.** They are the offices closest to
  residents, but council boundaries are not in TIGERweb.
- **Live bill and hearing data** is linked rather than embedded. The folders are already
  structured to hold it.
