const form = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("api-key");
const providerSelect = document.getElementById("ai-provider");
const modelNameInput = document.getElementById("model-name");
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
    aiProvider: "openai",
    modelName: "",
    captureFrequency: 2,
    customPrompt: "",
  },
  (items) => {
    providerSelect.value = items.aiProvider;
    modelNameInput.value = items.modelName;
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
      aiProvider: providerSelect.value,
      modelName: modelNameInput.value.trim(),
      captureFrequency: parseInt(captureFreqInput.value, 10) || 5,
      customPrompt: customPromptInput.value.trim(),
    },
    () => {
      saveMsg.classList.remove("hidden");
      setTimeout(() => saveMsg.classList.add("hidden"), 2500);
    }
  );
});
