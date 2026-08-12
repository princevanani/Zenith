const STORAGE_KEYS = { profile: "sff_profile", learned: "sff_learned", documents: "sff_documents" };
let profile = {};
let learnedFields = {};
let documents = {};

function groupByCategory() {
  const groups = {};
  for (const [key, def] of Object.entries(CANONICAL_FIELDS)) {
    if (def.type === "file") continue; // documents get their own section
    groups[def.category] = groups[def.category] || [];
    groups[def.category].push({ key, ...def });
  }
  return groups;
}

function fileFieldDefs() {
  return Object.entries(CANONICAL_FIELDS)
    .filter(([, def]) => def.type === "file")
    .map(([key, def]) => ({ key, ...def }));
}

function renderDocuments() {
  const container = document.getElementById("documentsList");
  container.innerHTML = "";
  fileFieldDefs().forEach((f) => {
    const saved = documents[f.key];
    const row = document.createElement("div");
    row.className = "fieldRow";
    row.innerHTML = `
      <label>${f.label}${f.sensitive ? '<span class="sensitiveTag">sensitive</span>' : ""}</label>
      <span class="docStatus">${saved ? `✓ ${escapeHtml(saved.name)}` : "Not uploaded"}</span>
      <span></span>
    `;
    const statusSpan = row.querySelector(".docStatus");
    statusSpan.style.cssText = "font-size:12px;color:" + (saved ? "#0f6e56" : "#9ca3af") + ";display:flex;align-items:center;gap:8px;";

    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = saved ? "Replace" : "Upload";
    uploadBtn.className = "secondary";
    uploadBtn.style.cssText = "padding:5px 10px;font-size:12px;";
    uploadBtn.type = "button";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.hidden = true;
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        documents[f.key] = { name: file.name, mimeType: file.type, base64 };
        persistDocuments();
        renderDocuments();
      };
      reader.readAsDataURL(file);
    });
    uploadBtn.addEventListener("click", () => fileInput.click());
    statusSpan.appendChild(uploadBtn);
    statusSpan.appendChild(fileInput);

    if (saved) {
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.className = "removeBtn";
      removeBtn.type = "button";
      removeBtn.addEventListener("click", () => {
        delete documents[f.key];
        persistDocuments();
        renderDocuments();
      });
      statusSpan.appendChild(removeBtn);
    }
    container.appendChild(row);
  });
}

function persistDocuments() { chrome.storage.local.set({ [STORAGE_KEYS.documents]: documents }); }

function renderCategories() {
  const container = document.getElementById("categories");
  container.innerHTML = "";
  const groups = groupByCategory();
  for (const [category, fields] of Object.entries(groups)) {
    const card = document.createElement("div");
    card.className = "catCard";
    const h2 = document.createElement("h2");
    h2.textContent = category;
    card.appendChild(h2);
    fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "fieldRow";
      row.innerHTML = `
        <label>${f.label}${f.sensitive ? '<span class="sensitiveTag">sensitive</span>' : ""}</label>
        <input type="text" data-key="${f.key}" value="${escapeHtml(profile[f.key] || "")}">
        <span></span>
      `;
      const input = row.querySelector("input");
      input.addEventListener("change", () => {
        if (input.value.trim()) profile[f.key] = input.value.trim();
        else delete profile[f.key];
        persistProfile();
      });
      card.appendChild(row);
    });
    container.appendChild(card);
  }
}

function renderLearned() {
  const list = document.getElementById("learnedList");
  const empty = document.getElementById("learnedEmpty");
  list.innerHTML = "";
  const entries = Object.entries(learnedFields);
  empty.style.display = entries.length ? "none" : "block";
  entries.forEach(([slug, entry]) => {
    const row = document.createElement("div");
    row.className = "learnedRow";
    row.innerHTML = `
      <span class="origLabel">${escapeHtml(entry.label || slug)}</span>
      <input type="text" value="${escapeHtml(entry.value)}">
      <button class="removeBtn">Remove</button>
    `;
    const input = row.querySelector("input");
    input.addEventListener("change", () => {
      learnedFields[slug] = { ...entry, value: input.value };
      persistLearned();
    });
    row.querySelector(".removeBtn").addEventListener("click", () => {
      delete learnedFields[slug];
      persistLearned();
      renderLearned();
    });
    list.appendChild(row);
  });
}

function persistProfile() { chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile }); }
function persistLearned() { chrome.storage.local.set({ [STORAGE_KEYS.learned]: learnedFields }); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Export / Import / Clear ----
document.getElementById("exportBtn").addEventListener("click", () => {
  const includeSensitive = document.getElementById("includeSensitive").checked;
  let exportProfile = { ...profile };
  let exportDocuments = { ...documents };
  if (!includeSensitive) {
    for (const [key, def] of Object.entries(CANONICAL_FIELDS)) {
      if (def.sensitive) { delete exportProfile[key]; delete exportDocuments[key]; }
    }
  }
  const blob = new Blob([JSON.stringify({ profile: exportProfile, learnedFields, documents: exportDocuments }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "smart-form-filler-data.json";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      profile = { ...profile, ...(data.profile || {}) };
      learnedFields = { ...learnedFields, ...(data.learnedFields || {}) };
      documents = { ...documents, ...(data.documents || {}) };
      persistProfile();
      persistLearned();
      persistDocuments();
      renderCategories();
      renderLearned();
      renderDocuments();
    } catch (err) {
      alert("Couldn't read that file — make sure it's a JSON export from this extension.");
    }
  };
  reader.readAsText(file);
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!confirm("This deletes all saved and learned form data from this browser. This can't be undone. Continue?")) return;
  profile = {};
  learnedFields = {};
  documents = {};
  chrome.storage.local.set({ [STORAGE_KEYS.profile]: {}, [STORAGE_KEYS.learned]: {}, [STORAGE_KEYS.documents]: {} }, () => {
    renderCategories();
    renderLearned();
    renderDocuments();
  });
});

chrome.storage.local.get([STORAGE_KEYS.profile, STORAGE_KEYS.learned, STORAGE_KEYS.documents], (res) => {
  profile = res[STORAGE_KEYS.profile] || {};
  learnedFields = res[STORAGE_KEYS.learned] || {};
  documents = res[STORAGE_KEYS.documents] || {};
  renderCategories();
  renderLearned();
  renderDocuments();
});
