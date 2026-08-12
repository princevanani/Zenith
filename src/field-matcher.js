/**
 * Field matching engine — runs identically inside the content script and
 * inside the Node/jsdom test harness (works against any `document`-like
 * object, no browser-only APIs used here).
 */
(function (root) {
  const FIELDS = (typeof module !== "undefined" && module.exports)
    ? require("./canonical-fields.js").CANONICAL_FIELDS
    : self.CANONICAL_FIELDS;

  const FILLABLE_TYPES = new Set([
    "text", "email", "tel", "number", "date", "search", "url", null, undefined, ""
  ]);

  /** Lowercase, strip diacritical noise from punctuation, collapse whitespace. */
  function normalize(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[*:]/g, " ")              // drop "required" markers / trailing colons
      .replace(/\(.*?\)/g, " ")           // drop "(optional)", "(dd/mm/yyyy)" etc.
      .replace(/[^\p{L}\p{N}\s/]/gu, " ") // strip punctuation, keep letters/digits/slash
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Turn normalized text into a stable slug used as a learned-field key. */
  function slugify(str) {
    return normalize(str).replace(/\s+/g, "_");
  }

  /** Best-effort human-readable label for a form field. */
  function getFieldLabelText(el, doc) {
    doc = doc || el.ownerDocument;

    // 1. <label for="id">
    if (el.id) {
      const forLabel = doc.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (forLabel && forLabel.textContent.trim()) return forLabel.textContent;
    }
    // 2. wrapping <label>
    let p = el.parentElement;
    let hops = 0;
    while (p && hops < 4) {
      if (p.tagName === "LABEL" && p.textContent.trim()) return p.textContent;
      p = p.parentElement;
      hops++;
    }
    // 3. aria-label / aria-labelledby
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ref = doc.getElementById(labelledBy);
      if (ref && ref.textContent.trim()) return ref.textContent;
    }
    // 4. placeholder
    if (el.getAttribute("placeholder")) return el.getAttribute("placeholder");
    // 5. nearest preceding text (common in table-based / legacy govt forms:
    //    <td>Father's Name</td><td><input></td>)
    const cell = el.closest("td, div, li");
    if (cell) {
      const prevCell = cell.previousElementSibling;
      if (prevCell && prevCell.textContent.trim().length < 60) return prevCell.textContent;
    }
    return "";
  }

  function cssEscape(id) {
    return String(id).replace(/([^\w-])/g, "\\$1");
  }

  /** Build the full text signature used for matching: label + name + id + autocomplete. */
  function buildSignature(el) {
    const labelText = getFieldLabelText(el);
    const parts = [labelText, el.name || "", el.id || "", el.getAttribute("autocomplete") || ""];
    return {
      labelText: labelText.trim(),
      normalized: normalize(parts.join(" ")),
      labelNormalized: normalize(labelText),
      slug: slugify(labelText || el.name || el.id || ""),
    };
  }

  function tokenSet(str) {
    return new Set(normalize(str).split(" ").filter(Boolean));
  }

  function jaccard(a, b) {
    const A = tokenSet(a), B = tokenSet(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    const union = A.size + B.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  /**
   * Match a signature against the canonical dictionary. Returns {key, score} or null.
   * By default matches only text-ish fields (type !== "file"). Pass {fileOnly:true}
   * when matching a file input, so a text field can never resolve to a document key
   * and vice versa.
   */
  function matchCanonical(signature, opts) {
    const wantFile = !!(opts && opts.fileOnly);
    let best = null;
    for (const [key, def] of Object.entries(FIELDS)) {
      const fieldType = def.type || "text";
      if (wantFile !== (fieldType === "file")) continue;
      for (const syn of def.synonyms) {
        const synNorm = normalize(syn);
        if (!synNorm) continue;
        let score = 0;
        if (signature.normalized === synNorm) score = 1;
        else if (signature.labelNormalized === synNorm) score = 0.97;
        else if (signature.normalized.includes(synNorm) && synNorm.split(" ").length > 1) score = 0.85;
        else score = jaccard(signature.normalized, synNorm) * 0.8;
        if (score > 0.55 && (!best || score > best.score)) {
          best = { key, score, category: def.category, sensitive: def.sensitive, label: def.label };
        }
      }
    }
    return best;
  }

  /** Match a signature against previously-learned custom fields (cross-site reuse). */
  function matchLearned(signature, learnedFields) {
    if (!signature.slug) return null;
    if (learnedFields[signature.slug]) {
      return { slug: signature.slug, score: 1, entry: learnedFields[signature.slug] };
    }
    let best = null;
    for (const [slug, entry] of Object.entries(learnedFields)) {
      const score = jaccard(signature.labelNormalized, slug.replace(/_/g, " "));
      if (score > 0.6 && (!best || score > best.score)) {
        best = { slug, score, entry };
      }
    }
    return best;
  }

  function isFillableElement(el) {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return FILLABLE_TYPES.has(type) || type === "text";
  }

  function elType(el) {
    return el.tagName === "INPUT" ? (el.getAttribute("type") || "text").toLowerCase() : "";
  }
  function isFileElement(el) { return elType(el) === "file"; }
  function isRadioElement(el) { return elType(el) === "radio"; }
  function isCheckboxElement(el) { return elType(el) === "checkbox"; }

  /** Group text/label for a set of radios/checkboxes that share a `name` (fieldset>legend, or nearest preceding cell). */
  function getGroupLabelText(groupEls) {
    const first = groupEls[0];
    const fieldset = first.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && legend.textContent.trim()) return legend.textContent;
    }
    const cell = first.closest("td, div, li");
    if (cell) {
      const prevCell = cell.previousElementSibling;
      if (prevCell && prevCell.textContent.trim().length < 60) return prevCell.textContent;
    }
    return "";
  }

  /** Build a signature for a radio/checkbox GROUP (matched against the canonical dictionary as one field). */
  function buildGroupSignature(groupEls) {
    const labelText = getGroupLabelText(groupEls);
    const name = groupEls[0].name || "";
    return {
      labelText: labelText.trim(),
      normalized: normalize([labelText, name].join(" ")),
      labelNormalized: normalize(labelText),
      slug: slugify(labelText || name),
    };
  }

  /** Given a set of {el, label} options (radio buttons, checkboxes, or <option>s), find the one matching `value`. */
  function pickOptionByValue(options, value) {
    const target = normalize(value);
    if (!target) return null;
    let exact = options.find(o => normalize(o.label) === target);
    if (exact) return exact;
    let contains = options.find(o => normalize(o.label).includes(target) || target.includes(normalize(o.label)));
    if (contains) return contains;
    let best = null, bestScore = 0;
    for (const o of options) {
      const score = jaccard(o.label, value);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return bestScore > 0.5 ? best : null;
  }

  const api = {
    normalize, slugify, getFieldLabelText, buildSignature,
    matchCanonical, matchLearned, isFillableElement, jaccard,
    isFileElement, isRadioElement, isCheckboxElement,
    getGroupLabelText, buildGroupSignature, pickOptionByValue,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else self.FieldMatcher = api;
})(typeof self !== "undefined" ? self : this);
