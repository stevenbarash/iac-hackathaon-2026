# Selective UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate PR #2's strongest wayfinding, accessibility, results, and contact-action patterns into the existing server-backed civic app.

**Architecture:** Keep the existing dependency-free HTML/CSS/JavaScript application and API contract. Add appearance state and contact drafting in the browser, while rendering existing API data through a transit-inspired presentation system.

**Tech Stack:** Semantic HTML, CSS custom properties, browser DOM APIs, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-30-selective-ui-integration-design.md`

## Global Constraints

- Do not replace server-side lookup with client-side geocoding.
- Do not add dependencies, static official data, unsupported political summaries, or inferred evidence.
- Preserve live/demo separation, source attribution, verification metadata, keyboard support, focus management, and reduced-motion behavior.
- Preserve unrelated uncommitted changes already present in the worktree.

---

### Task 1: Appearance controls and visual system

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Test: `test/static.test.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: existing document root and application bootstrap.
- Produces: `setAppearance(attribute, value)`, stored `kyo.theme.v1` and `kyo.textsize.v1` preferences, and pressed-state masthead controls.

- [ ] **Step 1: Add failing static/client assertions**

Assert that the HTML exposes `theme-switch` and `textsize-switch`, and that client source contains storage keys and pressed-state updates.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test test/static.test.js test/client.test.js`

- [ ] **Step 3: Implement masthead controls and tokens**

Add semantic switch fieldsets, light/dark token sets, 18/20/23px root sizes, sticky header styling, and storage-safe JavaScript initialization.

- [ ] **Step 4: Run focused tests and confirm success**

Run: `node --test test/static.test.js test/client.test.js`

### Task 2: Transit-style results and profile contact actions

**Files:**
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: existing lookup/profile payloads and `officialPortrait(official)`.
- Produces: `governmentLevel(official)`, `districtBullet(official)`, compact result rows, call links, and contact-copy buttons.

- [ ] **Step 1: Add failing client assertions**

Assert that route bullets, level-specific classes, telephone actions, and safe clipboard handling are present.

- [ ] **Step 2: Run the focused client test and confirm failure**

Run: `node --test test/client.test.js`

- [ ] **Step 3: Implement presentation helpers and actions**

Derive level only from the API office string, attach a district-number bullet to each portrait, switch the results container to full-width rows, and render Call/copy actions only when values exist.

- [ ] **Step 4: Run the focused client test and confirm success**

Run: `node --test test/client.test.js`

### Task 3: Local writing dialog and complete verification

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Test: `test/client.test.js`

**Interfaces:**
- Consumes: current profile identity/contact data and native `<dialog>`.
- Produces: `openDraft(profile)`, an editable local draft, clipboard copy, and email or official-site handoff.

- [ ] **Step 1: Add failing dialog assertions**

Assert that the dialog shell, `openDraft`, editable draft output, and safe email/site routing exist.

- [ ] **Step 2: Run the focused client test and confirm failure**

Run: `node --test test/client.test.js`

- [ ] **Step 3: Implement the local drafting workflow**

Build topic/name/hometown controls and regenerate a concise resident-authored template locally. Never send draft content to the civic API.

- [ ] **Step 4: Run all automated tests**

Run: `npm test`

- [ ] **Step 5: Verify the rendered app**

Exercise demo search, results, profile navigation, topic filters, appearance controls, Call/Write actions, draft updates, desktop layout, and mobile layout. Compare screenshots against the approved concept and inspect both images directly.
