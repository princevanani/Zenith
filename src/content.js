/**
 * Zenith — content script.
 * Runs on every page. Two jobs:
 *   1. LEARN: watch fields the user interacts with, save values locally.
 *   2. FILL: on request, fill every recognizable field from saved data —
 *      text/textarea, native <select>, radio groups, checkboxes, common
 *      ARIA-based custom dropdowns, and file inputs (photo/signature/certs).
 * All storage is local (chrome.storage.local) — nothing is ever sent
 * anywhere by this extension.
 */
(function () {
  const matcher = self.FieldMatcher;
  const STORAGE_KEYS = {
    profile: "sff_profile", learned: "sff_learned",
    settings: "sff_settings", documents: "sff_documents",
  };
  const DEFAULT_SETTINGS = { autoLearn: true, showFloatingButton: true };

  let profile = {};
  let learnedFields = {};
  let documents = {}; // canonicalFileKey -> {name, mimeType, base64}
  let settings = { ...DEFAULT_SETTINGS };

  let textFields = [];      // [{el, sig}]  text/email/tel/number/date/textarea/select
  let radioGroups = [];     // [{name, radios:[{el,label}], sig}]
  let checkboxGroups = [];  // [{name, boxes:[{el,label}], sig}]  (shared name = multi-select)
  let soloCheckboxes = [];  // [{el, sig}]  (unique name = single yes/no)
  let fileFields = [];      // [{el, sig}]
  let customDropdowns = []; // [{el, sig}]  role=combobox/listbox triggers, not native <select>

  let floatingBtn = null;
  let rescanTimer = null;

  function loadState(cb) {
    chrome.storage.local.get(Object.values(STORAGE_KEYS), (res) => {
      profile = res[STORAGE_KEYS.profile] || {};
      learnedFields = res[STORAGE_KEYS.learned] || {};
      documents = res[STORAGE_KEYS.documents] || {};
      settings = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.settings] || {}) };
      cb && cb();
    });
  }

  function saveProfileField(key, value) {
    if (profile[key] === value) return;
    profile[key] = value;
    chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile });
  }
  function saveLearnedField(slug, label, value) {
    const existing = learnedFields[slug];
    if (existing && existing.value === value) return;
    learnedFields[slug] = { label, value, updatedAt: Date.now() };
    chrome.storage.local.set({ [STORAGE_KEYS.learned]: learnedFields });
  }

  // ---- Native value setter that plays nicely with React/Vue controlled inputs ----
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    const nativeSetter = descriptor && descriptor.set;
    if (nativeSetter) nativeSetter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelectValue(el, value) {
    const opts = [...el.options].map(o => ({ el: o, label: o.textContent }));
    const match = matcher.pickOptionByValue(opts, value) ||
      opts.find(o => o.el.value === value);
    if (match) {
      el.value = match.el.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  function setRadioGroupValue(radios, value) {
    const match = matcher.pickOptionByValue(radios, value);
    if (!match) return false;
    match.el.checked = true;
    match.el.dispatchEvent(new Event("click", { bubbles: true }));
    match.el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setCheckboxGroupValue(boxes, value) {
    // value may be a single string or comma-separated list of options to check
    const wanted = String(value).split(",").map(s => s.trim()).filter(Boolean);
    let any = false;
    boxes.forEach(({ el, label }) => {
      const shouldCheck = wanted.some(w => matcher.normalize(w) === matcher.normalize(label) ||
        matcher.normalize(label).includes(matcher.normalize(w)));
      if (shouldCheck && !el.checked) {
        el.checked = true;
        el.dispatchEvent(new Event("click", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        any = true;
      }
    });
    return any;
  }

  function setSoloCheckboxValue(el, value) {
    const truthy = ["yes", "true", "y", "checked", "1"].includes(String(value).trim().toLowerCase());
    if (el.checked !== truthy) {
      el.checked = truthy;
      el.dispatchEvent(new Event("click", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  // ---- File fields: reconstruct a File from saved base64 and assign via DataTransfer ----
  function base64ToFile(doc) {
    const byteChars = atob(doc.base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    return new File([bytes], doc.name || "upload", { type: doc.mimeType || "application/octet-stream" });
  }
  function setFileValue(el, doc) {
    try {
      const file = base64ToFile(doc);
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("Zenith: could not set file field", e);
      return false;
    }
  }

  // ---- Best-effort fill for custom (non-native) dropdown widgets ----
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function findVisibleOptionEls() {
    return [...document.querySelectorAll('[role="option"], [role="listbox"] li, [role="listbox"] div')]
      .filter(o => o.offsetParent !== null && o.textContent.trim());
  }
  async function fillCustomDropdown(el, value) {
    if (el.tagName === "INPUT") {
      setNativeValue(el, value);
      await wait(180);
    } else {
      el.click();
      await wait(180);
    }
    const opts = findVisibleOptionEls().map(o => ({ el: o, label: o.textContent }));
    const match = matcher.pickOptionByValue(opts, value);
    if (match) { match.el.click(); return true; }
    if (el.tagName !== "INPUT") el.click(); // best-effort close if no match found
    return false;
  }

  // ---- Scanning ----
  function scanAll() {
    const all = [...document.querySelectorAll("input, select, textarea, [role='combobox'], [role='listbox']")];

    textFields = all
      .filter(el => (el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.tagName === "INPUT"))
      .filter(el => !el.disabled && matcher.isFillableElement(el))
      .filter(el => elIsVisible(el))
      .map(el => ({ el, sig: matcher.buildSignature(el) }));

    const radios = all.filter(el => matcher.isRadioElement(el) && !el.disabled);
    radioGroups = groupByName(radios).map(({ name, els }) => ({
      name, radios: els.map(el => ({ el, label: matcher.getFieldLabelText(el) })),
      sig: matcher.buildGroupSignature(els),
    }));

    const checkboxes = all.filter(el => matcher.isCheckboxElement(el) && !el.disabled);
    const cbGroups = groupByName(checkboxes);
    checkboxGroups = [];
    soloCheckboxes = [];
    cbGroups.forEach(({ name, els }) => {
      if (els.length > 1) {
        checkboxGroups.push({
          name, boxes: els.map(el => ({ el, label: matcher.getFieldLabelText(el) })),
          sig: matcher.buildGroupSignature(els),
        });
      } else {
        soloCheckboxes.push({ el: els[0], sig: matcher.buildSignature(els[0]) });
      }
    });

    fileFields = all
      .filter(el => matcher.isFileElement(el) && !el.disabled)
      .map(el => ({ el, sig: matcher.buildSignature(el) }));

    // Custom dropdown triggers: elements with an explicit combobox/listbox role that
    // aren't a native <select> (those are already covered by textFields).
    customDropdowns = all
      .filter(el => el.tagName !== "SELECT")
      .filter(el => {
        const role = (el.getAttribute("role") || "").toLowerCase();
        return role === "combobox" || (role === "listbox" && el.tagName !== "UL" && el.tagName !== "OL");
      })
      .filter(el => elIsVisible(el))
      .map(el => ({ el, sig: matcher.buildSignature(el) }));
  }

  function elIsVisible(el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  function groupByName(els) {
    const map = new Map();
    els.forEach(el => {
      const key = el.name || el.getAttribute("name") || `__no_name_${el.id || Math.random()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(el);
    });
    return [...map.entries()].map(([name, list]) => ({ name, els: list }));
  }

  // ---- Learning ----
  function attachLearningListeners() {
    textFields.forEach(({ el, sig }) => bindOnce(el, "blur", () => learnTextLike(sig, el.value)));

    radioGroups.forEach(({ radios, sig }) => {
      radios.forEach(({ el }) => bindOnce(el, "change", () => {
        if (!settings.autoLearn || !el.checked) return;
        const chosen = radios.find(r => r.el.checked);
        if (chosen) learnGroupLike(sig, chosen.label);
      }));
    });

    checkboxGroups.forEach(({ boxes, sig }) => {
      boxes.forEach(({ el }) => bindOnce(el, "change", () => {
        if (!settings.autoLearn) return;
        const chosenLabels = boxes.filter(b => b.el.checked).map(b => b.label.trim());
        if (chosenLabels.length) learnGroupLike(sig, chosenLabels.join(", "));
      }));
    });

    soloCheckboxes.forEach(({ el, sig }) => bindOnce(el, "change", () => {
      if (!settings.autoLearn) return;
      learnTextLike(sig, el.checked ? "yes" : "no");
    }));
  }

  function bindOnce(el, event, handler) {
    const flag = `sffBound_${event}`;
    if (el.dataset[flag]) return;
    el.dataset[flag] = "1";
    el.addEventListener(event, handler);
  }

  function learnTextLike(sig, rawValue) {
    if (!settings.autoLearn) return;
    const value = (rawValue || "").toString().trim();
    if (!value) return;
    const canonical = matcher.matchCanonical(sig);
    if (canonical && canonical.score >= 0.55) saveProfileField(canonical.key, value);
    else if (sig.slug) saveLearnedField(sig.slug, sig.labelText.trim() || sig.slug, value);
  }
  function learnGroupLike(sig, value) {
    if (!value) return;
    const canonical = matcher.matchCanonical(sig);
    if (canonical && canonical.score >= 0.55) saveProfileField(canonical.key, value);
    else if (sig.slug) saveLearnedField(sig.slug, sig.labelText.trim() || sig.slug, value);
  }

  // ---- Fill plan ----
  function computeFillable() {
    const plan = [];

    textFields.forEach(({ el, sig }) => {
      const canonical = matcher.matchCanonical(sig);
      if (canonical && profile[canonical.key] !== undefined) {
        plan.push({ kind: "text", el, value: profile[canonical.key], sensitive: canonical.sensitive, key: canonical.key });
        return;
      }
      const learned = matcher.matchLearned(sig, learnedFields);
      if (learned) plan.push({ kind: "text", el, value: learned.entry.value, sensitive: false, key: learned.slug });
    });

    radioGroups.forEach(({ radios, sig }) => {
      const canonical = matcher.matchCanonical(sig);
      const value = canonical ? profile[canonical.key] : (learnedFields[sig.slug] && learnedFields[sig.slug].value);
      if (value !== undefined) plan.push({ kind: "radio", radios, value, sensitive: canonical && canonical.sensitive, key: canonical ? canonical.key : sig.slug });
    });

    checkboxGroups.forEach(({ boxes, sig }) => {
      const canonical = matcher.matchCanonical(sig);
      const value = canonical ? profile[canonical.key] : (learnedFields[sig.slug] && learnedFields[sig.slug].value);
      if (value !== undefined) plan.push({ kind: "checkboxGroup", boxes, value, sensitive: canonical && canonical.sensitive, key: canonical ? canonical.key : sig.slug });
    });

    soloCheckboxes.forEach(({ el, sig }) => {
      const canonical = matcher.matchCanonical(sig);
      const value = canonical ? profile[canonical.key] : (learnedFields[sig.slug] && learnedFields[sig.slug].value);
      if (value !== undefined) plan.push({ kind: "checkbox", el, value, sensitive: canonical && canonical.sensitive, key: canonical ? canonical.key : sig.slug });
    });

    fileFields.forEach(({ el, sig }) => {
      const canonical = matcher.matchCanonical(sig, { fileOnly: true });
      if (canonical && documents[canonical.key]) {
        plan.push({ kind: "file", el, doc: documents[canonical.key], sensitive: canonical.sensitive, key: canonical.key });
      }
    });

    customDropdowns.forEach(({ el, sig }) => {
      const canonical = matcher.matchCanonical(sig);
      const value = canonical ? profile[canonical.key] : (learnedFields[sig.slug] && learnedFields[sig.slug].value);
      if (value !== undefined) plan.push({ kind: "customDropdown", el, value, sensitive: canonical && canonical.sensitive, key: canonical ? canonical.key : sig.slug });
    });

    return plan;
  }

  async function applyPlan(plan) {
    for (const item of plan) {
      switch (item.kind) {
        case "text":
          if (item.el.tagName === "SELECT") setSelectValue(item.el, item.value);
          else setNativeValue(item.el, item.value);
          flash(item.el);
          break;
        case "radio":
          if (setRadioGroupValue(item.radios, item.value)) {
            const chosen = item.radios.find(r => r.el.checked);
            if (chosen) flash(chosen.el);
          }
          break;
        case "checkboxGroup":
          setCheckboxGroupValue(item.boxes, item.value);
          item.boxes.forEach(b => { if (b.el.checked) flash(b.el); });
          break;
        case "checkbox":
          setSoloCheckboxValue(item.el, item.value);
          flash(item.el);
          break;
        case "file":
          setFileValue(item.el, item.doc);
          flash(item.el);
          break;
        case "customDropdown":
          await fillCustomDropdown(item.el, item.value);
          flash(item.el);
          break;
      }
    }
  }

  function flash(el) {
    if (!el || !el.style) return;
    el.style.transition = "background-color 0.4s";
    el.style.backgroundColor = "#eafff1";
    setTimeout(() => { el.style.backgroundColor = ""; }, 1200);
  }

  async function runAutofill() {
    scanAll();
    const plan = computeFillable();
    const hasSensitive = plan.some(p => p.sensitive);
    let finalPlan = plan;
    if (hasSensitive) {
      const ok = confirm(
        "This will also fill sensitive fields (Aadhaar / PAN / bank / ID documents) saved in your profile.\n\nContinue?"
      );
      if (!ok) finalPlan = plan.filter(p => !p.sensitive);
    }
    await applyPlan(finalPlan);
    attachLearningListeners();
    return finalPlan.length;
  }

  // ---- Floating "Autofill" button ----
  const BUTTON_POS_KEY = "sff_button_pos";
  let savedButtonPos = null; // {left, top} in px, or null = default bottom-right
  let activeDrag = false;    // true between pointerdown and pointerup on the button
  let resizeDebounce = null;
  let windowIsFullscreen = false; // authoritative, from chrome.windows via background.js

  function refreshWindowFullscreenState() {
    try {
      chrome.runtime.sendMessage({ type: "SFF_GET_WINDOW_STATE" }, (res) => {
        if (chrome.runtime.lastError) return; // extension context gone/reloading — ignore
        windowIsFullscreen = !!(res && res.state === "fullscreen");
        updateFullscreenVisibility();
      });
    } catch (e) { /* ignore — page may be unloading */ }
  }

  function isDocFullscreen() {
    // Case 1: the Fullscreen API (a video, or a page element, requesting fullscreen)
    // — instant, synchronous, always correct.
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    // Case 2: F11 / OS-level "hide the browser chrome" fullscreen — this has no DOM
    // event, so we rely on the cached answer from chrome.windows (see
    // refreshWindowFullscreenState), which is authoritative rather than guessed.
    return windowIsFullscreen;
  }

  function clampToViewport(left, top, width, height) {
    const maxLeft = Math.max(4, window.innerWidth - width - 4);
    const maxTop = Math.max(4, window.innerHeight - height - 4);
    return { left: Math.min(Math.max(4, left), maxLeft), top: Math.min(Math.max(4, top), maxTop) };
  }

  function saveButtonPos(pos) {
    savedButtonPos = pos;
    chrome.storage.local.set({ [BUTTON_POS_KEY]: pos });
  }

  function injectFloatingButton() {
    if (!settings.showFloatingButton || activeDrag) return; // never touch the DOM mid-drag
    const plan = computeFillable();

    if (plan.length === 0) {
      if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
      return;
    }

    // If a button already exists, just refresh its count in place instead of
    // destroying and rebuilding it — rebuilding on every rescan (which fires on
    // any DOM mutation on the page) was tearing the element out from under an
    // in-progress drag.
    if (floatingBtn && floatingBtn.isConnected) {
      const shadow = floatingBtn.shadowRoot;
      const btnEl = shadow && shadow.getElementById("sff-btn");
      if (btnEl && !btnEl.classList.contains("dragging")) {
        btnEl.textContent = `⚡ Autofill (${plan.length})`;
      }
      updateFullscreenVisibility();
      return;
    }

    const host = document.createElement("div");
    host.id = "sff-floating-host";
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:20px;right:20px;";
    if (isDocFullscreen()) host.style.display = "none"; // hidden immediately if page is already fullscreen

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        button {
          font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #2563eb; color: #fff; border: none; border-radius: 999px;
          padding: 12px 18px; box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: grab;
          display: flex; align-items: center; gap: 8px;
          touch-action: none; user-select: none;
        }
        button:hover { background: #1d4ed8; }
        button:active { cursor: grabbing; }
        button.dragging { transform: scale(1.03); box-shadow: 0 6px 20px rgba(0,0,0,.35); }
      </style>
      <button id="sff-btn" title="Click to autofill · drag to move">⚡ Autofill (${plan.length})</button>
    `;
    const btnEl = shadow.getElementById("sff-btn");

    // Apply a remembered position (clamped in case the viewport shrank since it was saved).
    if (savedButtonPos) {
      const { left, top } = clampToViewport(savedButtonPos.left, savedButtonPos.top, 160, 44);
      host.style.left = left + "px";
      host.style.top = top + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    }

    // ---- Drag to move (Pointer Events cover mouse/touch/pen uniformly) ----
    const dragState = { moved: false };
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    btnEl.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragState.moved = false;
      activeDrag = true;
      startX = e.clientX; startY = e.clientY;
      const rect = host.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      btnEl.setPointerCapture(e.pointerId);
    });

    btnEl.addEventListener("pointermove", (e) => {
      if (e.buttons === 0) return; // not pressed
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragState.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        dragState.moved = true;
        btnEl.classList.add("dragging");
        host.style.right = "auto";
        host.style.bottom = "auto";
      }
      if (dragState.moved) {
        const rect = host.getBoundingClientRect();
        const { left, top } = clampToViewport(startLeft + dx, startTop + dy, rect.width, rect.height);
        host.style.left = left + "px";
        host.style.top = top + "px";
      }
    });

    btnEl.addEventListener("pointerup", () => {
      btnEl.classList.remove("dragging");
      activeDrag = false;
      if (dragState.moved) {
        const rect = host.getBoundingClientRect();
        saveButtonPos({ left: rect.left, top: rect.top });
      }
    });

    btnEl.addEventListener("click", async () => {
      if (dragState.moved) { dragState.moved = false; return; } // suppress the click that follows a drag
      const count = await runAutofill();
      btnEl.textContent = `✓ Filled ${count} field${count === 1 ? "" : "s"}`;
      setTimeout(() => injectFloatingButton(), 1500);
    });

    document.documentElement.appendChild(host);
    floatingBtn = host;
  }

  function updateFullscreenVisibility() {
    if (!floatingBtn) return;
    floatingBtn.style.display = isDocFullscreen() ? "none" : "";
  }
  document.addEventListener("fullscreenchange", updateFullscreenVisibility);
  document.addEventListener("webkitfullscreenchange", updateFullscreenVisibility);
  window.addEventListener("resize", () => {
    // F11 / OS-level fullscreen never fires fullscreenchange — only a resize, since
    // the window's outer frame changes size. Debounced since resize fires rapidly;
    // ask the background worker for the real window state once it settles.
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(refreshWindowFullscreenState, 200);
  });
  // Safety net: re-check periodically in case some window manager doesn't fire a
  // resize event for a fullscreen toggle (rare, but this keeps it self-correcting).
  setInterval(refreshWindowFullscreenState, 2000);

  // ---- Re-scan on DOM changes (SPA forms that render late) ----
  function scheduleRescan() {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      scanAll();
      attachLearningListeners();
      injectFloatingButton();
    }, 600);
  }

  function init() {
    loadState(() => {
      chrome.storage.local.get([BUTTON_POS_KEY], (res) => {
        savedButtonPos = res[BUTTON_POS_KEY] || null;
        scanAll();
        attachLearningListeners();
        injectFloatingButton();
        refreshWindowFullscreenState();
      });
      const observer = new MutationObserver(scheduleRescan);
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SFF_RUN_AUTOFILL") {
      runAutofill().then(count => sendResponse({ filled: count }));
      return true; // async response
    }
    if (msg.type === "SFF_GET_STATS") {
      scanAll();
      const plan = computeFillable();
      sendResponse({ fillableCount: plan.length });
    }
    return true;
  });

  if (document.readyState === "complete" || document.readyState === "interactive") init();
  else document.addEventListener("DOMContentLoaded", init);
})();