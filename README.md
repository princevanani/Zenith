# Zenith — Smart Form Filler

*One profile. Every form.*

A Chrome extension (Manifest V3) that fills scholarship, admission, and
government-exam forms in one click, and learns new fields automatically as
you type — no manual setup, works on any site, in English/Hindi/Gujarati
out of the box. Handles every common field type: text, native dropdowns,
radio buttons, checkboxes, best-effort custom (JS-widget) dropdowns, and
file uploads (photo, signature, certificates).

Other tagline options, if "One profile. Every form." isn't quite it:
- "Fill once. Apply anywhere."
- "Smart form filler for every application."

## Why this is different from "just use Chrome's autofill"

Chrome's built-in autofill only knows a fixed Western schema (name, address,
card number). It has no idea what "पिता का नाम", "Category (General/OBC/SC/ST)",
or "10th Percentage" means, and it can't learn a field it's never seen
before. This extension is purpose-built for the Indian
scholarship/admission/govt-exam field taxonomy, and — crucially — it keeps
learning fields you enter that *aren't* in that taxonomy, so the second
time you fill a "Blood Group" or "Category of Disability" field on some
random state portal, it's already saved.

## How it works (high level)

```
┌─────────────────────────────────────────────────────────────┐
│  Any web page (govt portal, scholarship site, college form)  │
│                                                                │
│   ┌─────────────┐        ┌────────────────────────────┐      │
│   │  Content    │───────▶│  Field Matching Engine       │     │
│   │  Script     │        │  (field-matcher.js)          │     │
│   │  - scans    │        │  1. builds a "signature" for │     │
│   │    DOM      │        │     each field: label text + │     │
│   │  - injects  │        │     name/id/autocomplete     │     │
│   │    Autofill │        │  2. matches it against the   │     │
│   │    button   │        │     canonical dictionary     │     │
│   │  - listens  │        │     (~35 fields, multi-lang) │     │
│   │    for typed│        │  3. falls back to previously │     │
│   │    values   │        │     learned custom fields    │     │
│   └─────┬───────┘        │     (fuzzy label matching)   │     │
│         │                └───────────────┬──────────────┘     │
└─────────┼────────────────────────────────┼────────────────────┘
          │                                │
          ▼                                ▼
   chrome.storage.local            chrome.storage.local
   "sff_profile"                   "sff_learned"
   { full_name: "...",             { blood_group: {label, value},
     father_name: "...",             ...any field the taxonomy
     aadhaar_number: "..." }         doesn't cover }
```

- **Content script** (`src/content.js`) runs on every page. It scans
  `input`/`select`/`textarea` elements, listens for `blur` events to learn
  values, and injects a small floating "⚡ Autofill" button when it detects
  fields it can fill.
- **Field matching engine** (`src/field-matcher.js` +
  `src/canonical-fields.js`) is the core IP. It builds a text "signature"
  for each field from every signal available (`<label for>`, wrapping
  `<label>`, `aria-label`, `placeholder`, `autocomplete`, nearby table
  cell text, `name`/`id` attributes) and matches it against a canonical
  field dictionary. This is what lets it work across wildly different
  site structures — old table-based government portals, Bootstrap forms,
  and label-less React SPAs — without per-site configuration.
- **Storage** is 100% local (`chrome.storage.local`), never
  `chrome.storage.sync`, specifically so sensitive fields (Aadhaar, PAN,
  bank account) don't get synced to a Google account/cloud silently.
- **Popup** (`popup/`) shows how many fields on the current page can be
  filled and lets you trigger autofill or open the profile manager.
- **Options page** (`options/`) is the full profile manager — edit any
  saved field by category, rename/remove auto-learned custom fields,
  export/import your data as JSON, or wipe everything.
- **Background service worker** (`background.js`) just adds a right-click
  "Autofill this form" context menu item.

## Field type coverage

| Field type | How it's handled | Confidence |
|---|---|---|
| Text / email / tel / number / date / textarea | Native value setter (React/Vue-safe) | Reliable |
| Native `<select>` | Matches saved value to the right `<option>` by text or value | Reliable |
| Radio button groups | Groups by `name`, reads the `<fieldset><legend>` (or nearest label text) as the field label, picks the option whose own label matches the saved value | Reliable |
| Checkboxes (single, e.g. a declaration) | Treated as a yes/no canonical-style field | Reliable |
| Checkbox groups (multi-select, e.g. "subjects interested in") | Saved as a comma-separated list; each matching option gets checked | Reliable |
| File uploads (photo, signature, certificates) | You upload each document once in the options page; Zenith reconstructs a real `File` from the saved copy and assigns it via `DataTransfer`, the same technique browsers use internally — this is not a workaround, it's the standard non-hacky way to script a file input | Reliable, standard technique |
| Custom / JS-widget dropdowns (React-select, MUI Autocomplete, Ant Design, etc. — anything with `role="combobox"`/`role="listbox"` instead of a native `<select>`) | Types the value in (if it's a searchable combobox) or clicks to open, then clicks the rendered option matching the saved value | **Best-effort** — every widget library behaves slightly differently, so this can miss on some sites. Please report any that don't work so the heuristic can be tuned. |

## Security model (v1)

- All data stays in `chrome.storage.local` on the user's own device —
  nothing is ever sent to a server (there is no backend in this version).
- Aadhaar/PAN/bank fields — and the ID-proof document upload — are flagged
  `sensitive` in the dictionary. If an autofill run would touch any of
  them, the user gets an explicit confirm dialog before those specific
  fields are filled.
- JSON export excludes sensitive fields and sensitive documents by default
  (opt-in checkbox to include them).
- Uploaded documents (photo, signature, certificates) are stored as
  base64 in `chrome.storage.local` under `sff_documents`, device-only,
  same as everything else. The `unlimitedStorage` permission is requested
  because scanned certificates can exceed Chrome's default ~10MB local
  storage quota — no data leaves the device because of it.
- Password fields are never read, filled, or learned.
- **Not yet built (see roadmap):** at-rest encryption of sensitive fields,
  and a per-site trust list (so autofill only fires automatically on
  domains you've approved). Treat this v1 as "safe from other sites/
  extensions reading your data" but not yet "safe from a phishing page
  that convincingly asks for your Aadhaar number" — the confirm dialog is
  the current mitigation until per-site trust ships.

## Growing the field dictionary

`src/canonical-fields.js` currently covers ~35 canonical fields (personal,
address, identity, financial, education) with English + Hindi + Gujarati
synonyms. The Hindi/Gujarati phrasing is a starting seed, not exhaustive —
regional forms vary a lot. Any field that isn't recognized doesn't get
lost, though: it's automatically picked up by the learning engine as a
"custom field" keyed by its own label, and reused the next time a
similarly-labeled field appears on any site. Expanding the dictionary over
time (more languages, more field types) is just adding synonym arrays —
no logic changes needed.

## What's tested here vs. what still needs a real browser

This sandbox can't launch an actual Chrome instance or fetch arbitrary
external government/scholarship sites, so "tested on different sites" was
done two ways:

1. **`tests/run-tests.js`** — a Node/jsdom test suite (38 checks, all
   passing) that loads 7 fixture HTML forms (`tests/fixtures/`) modeled on
   real-world patterns: a table-based English scholarship form, a
   `label[for]`-based Hindi government exam form, a Bootstrap-style
   college admission form with mismatched `name`/`id` attributes, a
   Gujarati state-scholarship form, a brand-new "2nd year renewal" form on
   a simulated different site, a label-less placeholder-only SPA form,
   and a form exercising every non-text field type (radio groups,
   checkbox groups, a solo declaration checkbox, a native `<select>`, and
   three file inputs). It simulates a user filling out forms A–D, then
   confirms a **never-before-seen** form E/F gets auto-filled correctly
   from that learned profile, including a non-canonical field ("Blood
   Group") that only the learning engine knows about — plus separate
   checks that radio/checkbox groups resolve to the right canonical
   field, that `pickOptionByValue` selects the correct option under a
   saved value, and that file inputs match only against file-type
   canonical fields (never against text fields). Run it with
   `node tests/run-tests.js`.
2. **Manual load** — you'll still want to load this as an unpacked
   extension and try it on 2-3 real sites yourself (see below), since
   real sites have quirks (iframes, shadow DOM, React re-renders) that
   fixtures can't fully capture. The `MutationObserver` in `content.js`
   handles late-rendered fields, but please report anything odd.

## Loading it in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**, select this folder
4. Visit any form, fill a few fields normally — they're saved as you tab/
   click away from each field
5. Visit a different form; click the floating **⚡ Autofill** button (or
   the extension icon → "Autofill this page")

## Roadmap (this is the MVP — Phase 1)

- **Phase 1.5 — safety hardening:** per-site trust list (autofill button
  only appears/works on sites you've approved), passphrase-based AES-GCM
  encryption for sensitive fields at rest, per-field "always ask before
  filling" flags.
- **Phase 2 — cross-device sync (optional account):** a thin backend
  (fits your existing Next.js/.NET 8/FastAPI/MSSQL stack from Open Logic
  ERP) storing an *encrypted* blob per user, multi-tenant the same way —
  so a student's profile follows them from phone to laptop. Sync stays
  opt-in; local-only remains the default.
- **Phase 3 — smarter matching:** replace/augment the synonym dictionary
  with an embedding-based similarity model for cases the dictionary
  misses, plus crowd-sourced (opt-in, anonymized) field-signature ->
  canonical-key mappings so the whole user base's extension gets better
  over time — the same "network effect" data moat that makes something
  like this defensible as a product rather than a weekend script.
- **Phase 4 — beyond text fields:** checkboxes/radios (declarations,
  category selection), file-upload reminders ("you'll need your photo/
  signature here — want me to remind you what size govt forms usually
  want?"), and PDF form filling for offline scholarship applications.
- **Monetization shape:** free tier = unlimited local autofill (this repo);
  paid tier = cross-device sync + encrypted cloud backup + a "form
  finder" that surfaces scholarships/exams the student is eligible for
  based on their saved profile (10th/12th marks, category, income) —
  which pairs naturally with a database-savvy stack rather than being a
  separate skillset.

## Project layout

```
manifest.json
background.js
src/
  canonical-fields.js   # the field taxonomy + synonyms (the "knowledge base")
  field-matcher.js       # matching engine, shared by extension + tests
  content.js              # scans/learns/fills on every page
popup/                    # click-the-icon UI
options/                  # full profile manager
icons/
tests/
  fixtures/*.html         # 6 sample forms modeling different real sites
  run-tests.js             # jsdom test suite
```
