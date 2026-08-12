const fillableCountEl = document.getElementById("fillableCount");
const autofillBtn = document.getElementById("autofillBtn");
const manageBtn = document.getElementById("manageBtn");
const autoLearnToggle = document.getElementById("autoLearnToggle");
const savedSummary = document.getElementById("savedSummary");

function getActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => cb(tabs[0]));
}

function refreshStats() {
  getActiveTab((tab) => {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SFF_GET_STATS" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        fillableCountEl.textContent = "0";
        autofillBtn.disabled = true;
        return;
      }
      fillableCountEl.textContent = res.fillableCount;
      autofillBtn.disabled = res.fillableCount === 0;
    });
  });
}

autofillBtn.addEventListener("click", () => {
  getActiveTab((tab) => {
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "SFF_RUN_AUTOFILL" }, (res) => {
      if (res) {
        autofillBtn.textContent = `✓ Filled ${res.filled} field${res.filled === 1 ? "" : "s"}`;
        setTimeout(() => { autofillBtn.textContent = "Autofill this page"; refreshStats(); }, 1500);
      }
    });
  });
});

manageBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.local.get(["sff_settings", "sff_profile", "sff_learned"], (res) => {
  const settings = res.sff_settings || { autoLearn: true };
  autoLearnToggle.checked = settings.autoLearn !== false;
  const savedCount = Object.keys(res.sff_profile || {}).length + Object.keys(res.sff_learned || {}).length;
  savedSummary.textContent = `${savedCount} saved field${savedCount === 1 ? "" : "s"}`;
});

autoLearnToggle.addEventListener("change", () => {
  chrome.storage.local.get(["sff_settings"], (res) => {
    const settings = { ...(res.sff_settings || {}), autoLearn: autoLearnToggle.checked };
    chrome.storage.local.set({ sff_settings: settings });
  });
});

refreshStats();
