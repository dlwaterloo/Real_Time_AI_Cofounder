const form = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("api-key");
const captureFreqInput = document.getElementById("capture-freq");
const customPromptInput = document.getElementById("custom-prompt");
const saveMsg = document.getElementById("save-msg");

// ─── Load saved settings ────────────────────────────────────────────────────
// API key is stored in local storage (not synced) for security
chrome.storage.local.get({ apiKey: "" }, (local) => {
  apiKeyInput.value = local.apiKey;
});
chrome.storage.sync.get(
  {
    captureFrequency: 1,
    customPrompt: "",
  },
  (items) => {
    captureFreqInput.value = items.captureFrequency;
    customPromptInput.value = items.customPrompt;
  }
);

// ─── Save settings ──────────────────────────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Save API key to local storage (not synced for security)
  chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() });
  // Save other settings to sync storage
  chrome.storage.sync.set(
    {
      captureFrequency: parseInt(captureFreqInput.value, 10) || 1,
      customPrompt: customPromptInput.value.trim(),
    },
    () => {
      saveMsg.classList.remove("hidden");
      setTimeout(() => saveMsg.classList.add("hidden"), 2500);
    }
  );
});
