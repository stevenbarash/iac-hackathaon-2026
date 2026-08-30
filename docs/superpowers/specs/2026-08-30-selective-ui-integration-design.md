# Selective UI Integration Design

## Goal

Bring the strongest usability and visual ideas from PR #2 into the existing server-backed Know Your Officials app without replacing its API, evidence model, privacy boundary, or live/demo distinction.

## Scope

### Home

- Replace the dark banner header with a sticky, compact masthead.
- Add the route-bullet wordmark and persistent text-size and Auto/Light/Dark controls.
- Keep one full-address search path and the existing fictional demo action.
- Use the linked UI's larger, clearer search composition while retaining the current privacy explanation.

### Results

- Present officials as compact, full-width rows rather than a generic card grid.
- Add a transit-style district bullet to each portrait.
- Use color only for level of government: federal purple, state upper chamber green, state lower chamber orange. Party remains text.
- Keep the existing official data, evidence status, responsibilities, location confirmation, and Edit address action.
- Do not add filters or sorting while the current API intentionally returns a small representative set.

### Profile

- Preserve the two-column profile/evidence structure.
- Promote Call and Write to this office as primary actions when contact data supports them.
- Add copy controls for contact values.
- Add an on-device writing dialog with topic, resident name, hometown, editable draft, copy, and email/site handoff.
- Restyle evidence records as accessible disclosure sections while preserving topic filters, source links, verification status, and the explicit not-researched state.
- Do not add generic voting, committee, or hearing links that are not provided by the API.

## Design System

- Background: light neutral with true white cards; dark mode uses near-black and charcoal surfaces.
- Type: native grotesque/system stack; 18px base with 20px and 23px accessibility settings.
- Government colors: purple federal, green upper chamber, orange lower chamber.
- Geometry: restrained 8-14px radii, thin borders, subtle shadows, circular district bullets.
- Motion: only short hover, dialog, and loading feedback; disabled under reduced-motion preferences.

## State and Persistence

- Appearance preferences are stored in `localStorage`; failure to access storage is harmless.
- Existing application state and API calls remain unchanged.
- Draft content stays in browser memory and is never sent to the civic API.

## Accessibility and Responsive Behavior

- Preserve the skip link, live announcements, focus management, semantic headings, keyboard operation, and reduced-motion support.
- All appearance controls use pressed-state semantics.
- Results collapse cleanly to a two-column portrait/text row on phones.
- Profile columns stack, with contact actions remaining full-width and touch-friendly.

## Files

- `public/index.html`: masthead controls and writing dialog shell.
- `public/styles.css`: design tokens, themes, typography scaling, route bullets, row results, profile actions, and responsive states.
- `public/app.js`: appearance persistence, government-level presentation helpers, contact-copy actions, and local draft workflow.
- `test/client.test.js` and `test/static.test.js`: focused coverage for new controls and retained safety/accessibility behavior.

## Verification

- Run the existing test suite.
- Exercise demo search, results, profile, topic filtering, Call/Write actions, draft updates, copy behavior, appearance controls, keyboard focus, desktop layout, and mobile layout.
- Compare the final rendered screen with the approved visual concept for layout, typography, palette, component anatomy, copy, and responsive behavior.

## Explicit Non-Goals

- No replacement of server-side lookup with client-side geocoding.
- No static official snapshot.
- No new external dependencies or framework.
- No unsupported political summaries or inferred evidence.
- No broad results filtering, sorting, or generic resource folders in this pass.
