const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const matcher = require("../src/field-matcher.js");
const { CANONICAL_FIELDS } = require("../src/canonical-fields.js");

let pass = 0, fail = 0;
function check(desc, cond) {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${desc}`); }
  else { fail++; console.log(`  \x1b[31m✗ FAIL\x1b[0m ${desc}`); }
}

function loadFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return dom.window.document;
}

function scanFields(doc) {
  const els = [...doc.querySelectorAll("input, select, textarea")].filter(matcher.isFillableElement);
  return els.map(el => ({ el, sig: matcher.buildSignature(el) }));
}

// In-memory stand-ins for chrome.storage.local during the simulation
const profile = {};      // canonicalKey -> value
const learnedFields = {}; // slug -> { label, value }

function runLearningPass(doc, siteLabel) {
  console.log(`\n--- Simulated user fills out: ${siteLabel} ---`);
  const fields = scanFields(doc);
  for (const { el, sig } of fields) {
    // Simulate the user typing a plausible value for this field
    const sample = sampleValueFor(sig);
    if (!sample) continue;
    const canonical = matcher.matchCanonical(sig);
    if (canonical && canonical.score >= 0.55) {
      profile[canonical.key] = sample;
      console.log(`  learned -> canonical:${canonical.key} = "${sample}" (from "${sig.labelText.trim()}", score ${canonical.score.toFixed(2)})`);
    } else if (sig.slug) {
      learnedFields[sig.slug] = { label: sig.labelText.trim(), value: sample };
      console.log(`  learned -> custom:${sig.slug} = "${sample}" (from "${sig.labelText.trim()}")`);
    }
  }
}

function sampleValueFor(sig) {
  const t = sig.normalized;
  if (!t) return null;
  if (t.includes("name") || t.includes("नाम") || t.includes("નામ")) return "Priya Sharma";
  if (t.includes("email") || t.includes("ईमेल") || t.includes("ઈમેલ")) return "priya@example.com";
  if (t.includes("mobile") || t.includes("phone") || t.includes("मोबाइल") || t.includes("મોબાઈલ")) return "9876543210";
  if (t.includes("blood")) return "B+";
  if (t.includes("institute") || t.includes("college") || t.includes("કોલેજ")) return "Govt Polytechnic";
  return "SampleValue";
}

function runAutofillPass(doc, siteLabel) {
  console.log(`\n--- New site, testing autofill: ${siteLabel} ---`);
  const fields = scanFields(doc);
  let filled = 0;
  for (const { el, sig } of fields) {
    const canonical = matcher.matchCanonical(sig);
    if (canonical && profile[canonical.key] !== undefined) {
      el.value = profile[canonical.key];
      filled++;
      console.log(`  autofilled "${sig.labelText.trim()}" -> canonical:${canonical.key} = "${el.value}"`);
      continue;
    }
    const learned = matcher.matchLearned(sig, learnedFields);
    if (learned) {
      el.value = learned.entry.value;
      filled++;
      console.log(`  autofilled "${sig.labelText.trim()}" -> learned:${learned.slug} (score ${learned.score.toFixed(2)}) = "${el.value}"`);
    }
  }
  return filled;
}

console.log("=== Zenith — matcher test suite ===");

// 1. Canonical matching sanity checks across English/Hindi/Gujarati/naming-convention variety
console.log("\n[1] Canonical field recognition across fixtures 1-4");
const doc1 = loadFixture("1-english-scholarship.html");
const doc2 = loadFixture("2-hindi-govt-exam.html");
const doc3 = loadFixture("3-college-admission.html");
const doc4 = loadFixture("4-gujarati-scholarship.html");

function assertMatch(doc, elId, expectedKey, desc) {
  const el = doc.getElementById(elId);
  const sig = matcher.buildSignature(el);
  const m = matcher.matchCanonical(sig);
  check(`${desc} -> expected "${expectedKey}", got "${m && m.key}" (score ${m ? m.score.toFixed(2) : "-"})`,
    m && m.key === expectedKey);
}

assertMatch(doc1, "appName", "full_name", "[EN table] Applicant Name");
assertMatch(doc1, "fname", "father_name", "[EN table] Father's Name");
assertMatch(doc1, "aadhaar", "aadhaar_number", "[EN table] Aadhaar Number");
assertMatch(doc1, "acno", "bank_account_number", "[EN table] Bank Account Number");
assertMatch(doc1, "tenthpct", "tenth_marks", "[EN table] 10th Percentage");

assertMatch(doc2, "candName", "full_name", "[Hindi label-for] अभ्यर्थी का नाम");
assertMatch(doc2, "pName", "father_name", "[Hindi label-for] पिता का नाम");
assertMatch(doc2, "jTithi", "dob", "[Hindi label-for] जन्म तिथि");
assertMatch(doc2, "rollNo", "roll_number", "[Hindi label-for] पंजीकरण संख्या");
assertMatch(doc2, "jati", "category", "[Hindi label-for] जाति श्रेणी");

assertMatch(doc3, "f1", "full_name", "[EN div, mismatched attrs] Student Name (name=studentFullName)");
assertMatch(doc3, "f4", "phone", "[EN div, mismatched attrs] Contact Number (name=contactNo)");
assertMatch(doc3, "f9", "twelfth_marks", "[EN div, mismatched attrs] 12th Percentage");
assertMatch(doc3, "f10", "pan_number", "[EN div, mismatched attrs] PAN Card Number");

assertMatch(doc4, "vname", "full_name", "[Gujarati table] વિદ્યાર્થીનું નામ");
assertMatch(doc4, "pname", "father_name", "[Gujarati table] પિતાનું નામ");
assertMatch(doc4, "incomeg", "annual_income", "[Gujarati table] પરિવારની વાર્ષિક આવક");
assertMatch(doc4, "clg", "college_name", "[Gujarati table] કોલેજનું નામ");

// 2. Sensitive-field flagging
console.log("\n[2] Sensitive field flagging");
const aadhaarSig = matcher.buildSignature(doc1.getElementById("aadhaar"));
check("Aadhaar is flagged sensitive", matcher.matchCanonical(aadhaarSig).sensitive === true);
const nameSig = matcher.buildSignature(doc1.getElementById("appName"));
check("Name is NOT flagged sensitive", matcher.matchCanonical(nameSig).sensitive === false);

// 3. Placeholder/autocomplete fallback (no <label> at all)
console.log("\n[3] Label-less SPA-style form (placeholder/autocomplete fallback)");
const doc6 = loadFixture("6-placeholder-only-spa.html");
const spaFields = scanFields(doc6);
const spaEmail = spaFields.find(f => f.el.name === "userEmail");
const spaEmailMatch = matcher.matchCanonical(spaEmail.sig);
check(`placeholder-only email field matches "email" (got "${spaEmailMatch && spaEmailMatch.key}")`,
  spaEmailMatch && spaEmailMatch.key === "email");

// 4. Full learn-then-autofill simulation across "different sites"
console.log("\n[4] End-to-end simulation: fill form on site A, B, C, D -> new site E, F autofills automatically");
runLearningPass(doc1, "Site A: National-style scholarship form (English)");
runLearningPass(doc2, "Site B: State govt exam form (Hindi)");
runLearningPass(doc3, "Site C: College admission form (English, different field names)");
runLearningPass(doc4, "Site D: State scholarship form (Gujarati)");

const doc5 = loadFixture("5-renewal-form.html");
const filledOnRenewal = runAutofillPass(doc5, "Site E: 2nd-year renewal form (brand new site, never seen before)");
check(`Site E: at least 4 fields auto-filled without any manual setup (got ${filledOnRenewal})`, filledOnRenewal >= 4);
check(`Site E: "Blood Group" (non-canonical field) reused via learning`,
  doc5.getElementById("r3").value === "B+");
check(`Site E: "Father Name" filled from Site A's profile`,
  doc5.getElementById("r2").value === profile.father_name);

const doc6b = loadFixture("6-placeholder-only-spa.html");
const filledOnSpa = runAutofillPass(doc6b, "Site F: label-less SPA form");
check(`Site F: fields auto-filled on a totally different, label-less form (got ${filledOnSpa})`, filledOnSpa >= 2);

// 5. Radios, checkboxes, native select, and file inputs
console.log("\n[5] Radio groups, checkbox groups, solo checkbox, select, file inputs");
const doc7 = loadFixture("7-all-field-types.html");

function radiosByName(doc, name) {
  return [...doc.querySelectorAll(`input[type=radio][name="${name}"]`)];
}
function checkboxesByName(doc, name) {
  return [...doc.querySelectorAll(`input[type=checkbox][name="${name}"]`)];
}

// -- radio group signature + canonical match --
const genderRadios = radiosByName(doc7, "gender");
const genderSig = matcher.buildGroupSignature(genderRadios);
const genderMatch = matcher.matchCanonical(genderSig);
check(`Radio group "Gender" (fieldset/legend) -> canonical "gender" (got "${genderMatch && genderMatch.key}")`,
  genderMatch && genderMatch.key === "gender");

const catRadios = radiosByName(doc7, "cat");
const catSig = matcher.buildGroupSignature(catRadios);
const catMatch = matcher.matchCanonical(catSig);
check(`Radio group "Category" (fieldset/legend) -> canonical "category" (got "${catMatch && catMatch.key}")`,
  catMatch && catMatch.key === "category");

// -- picking the right radio option given a saved profile value --
const genderOptions = genderRadios.map(el => ({ el, label: matcher.getFieldLabelText(el) }));
const pickedGender = matcher.pickOptionByValue(genderOptions, "Female");
check(`pickOptionByValue selects the "Female" radio for saved value "Female"`,
  pickedGender && pickedGender.el.id === "g2");

const catOptions = catRadios.map(el => ({ el, label: matcher.getFieldLabelText(el) }));
const pickedCat = matcher.pickOptionByValue(catOptions, "OBC");
check(`pickOptionByValue selects the "OBC" radio for saved value "OBC"`,
  pickedCat && pickedCat.el.id === "c2");

// -- checkbox GROUP (multi-select) matches as a custom field and picks multiple --
const subjRadios = checkboxesByName(doc7, "subjects");
const subjSig = matcher.buildGroupSignature(subjRadios);
check(`Checkbox group "Subjects interested in" has no canonical match (expected -> falls back to learning)`,
  matcher.matchCanonical(subjSig) === null);
const subjOptions = subjRadios.map(el => ({ el, label: matcher.getFieldLabelText(el) }));
const pickedMath = matcher.pickOptionByValue(subjOptions, "Mathematics, Arts");
check(`pickOptionByValue resolves "Mathematics" out of a multi-value saved answer`,
  pickedMath && pickedMath.el.id === "s1");

// -- solo checkbox (declaration) treated as a single yes/no field --
const declareEl = doc7.getElementById("declare");
const declareSig = matcher.buildSignature(declareEl);
check(`Solo checkbox "declaration" gets a usable label/signature for learning`,
  declareSig.labelText.toLowerCase().includes("declare"));

// -- native select value/option matching (state) --
const stateEl = doc7.getElementById("stateSelect");
const stateOpts = [...stateEl.options].map(o => ({ el: o, label: o.textContent }));
const pickedState = matcher.pickOptionByValue(stateOpts, "Gujarat");
check(`Native <select> option matching resolves "Gujarat" to the correct <option>`,
  pickedState && pickedState.el.value === "GJ");

// -- file inputs match against file-only canonical fields, not text fields --
const photoEl = doc7.getElementById("photoUpload");
const photoSig = matcher.buildSignature(photoEl);
const photoMatch = matcher.matchCanonical(photoSig, { fileOnly: true });
check(`File input "Upload Photograph" -> canonical file field "photo" (got "${photoMatch && photoMatch.key}")`,
  photoMatch && photoMatch.key === "photo");
check(`File input does NOT match against text-only lookup (type isolation)`,
  matcher.matchCanonical(photoSig) === null);

const sigUploadEl = doc7.getElementById("sigUpload");
const sigUploadMatch = matcher.matchCanonical(matcher.buildSignature(sigUploadEl), { fileOnly: true });
check(`File input "Upload Signature" -> canonical file field "signature" (got "${sigUploadMatch && sigUploadMatch.key}")`,
  sigUploadMatch && sigUploadMatch.key === "signature");

const casteEl = doc7.getElementById("casteUpload");
const casteMatch = matcher.matchCanonical(matcher.buildSignature(casteEl), { fileOnly: true });
check(`File input "Caste Certificate" -> canonical file field "category_certificate" (got "${casteMatch && casteMatch.key}")`,
  casteMatch && casteMatch.key === "category_certificate");

// 6. Custom (non-native) ARIA dropdown: option-picking logic once options are visible
// (The click-to-open interaction itself is widget-specific and needs a real browser +
// the target site's JS framework — see README. This tests the matching primitive that
// drives it: given a rendered option list, pick the right one for a saved value.)
console.log("\n[6] Custom ARIA dropdown option matching (post-open state)");
const comboFixture = new JSDOM(`<!doctype html><html><body>
  <div role="combobox" aria-expanded="true" id="stateCombo">Select state</div>
  <ul role="listbox">
    <li role="option">Gujarat</li>
    <li role="option">Maharashtra</li>
    <li role="option">Rajasthan</li>
  </ul>
</body></html>`).window.document;
const comboOptions = [...comboFixture.querySelectorAll('[role="option"]')].map(o => ({ el: o, label: o.textContent }));
const pickedCombo = matcher.pickOptionByValue(comboOptions, "Maharashtra");
check(`Custom dropdown option list resolves "Maharashtra" correctly`,
  pickedCombo && pickedCombo.label === "Maharashtra");

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
