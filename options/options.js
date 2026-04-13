const form = document.getElementById("settings-form");
const apiKeyInput = document.getElementById("api-key");
const providerSelect = document.getElementById("ai-provider");
const modelNameInput = document.getElementById("model-name");
const captureFreqInput = document.getElementById("capture-freq");
const customPromptInput = document.getElementById("custom-prompt");
const saveMsg = document.getElementById("save-msg");

// ─── Load saved settings ────────────────────────────────────────────────────
chrome.storage.sync.get(
  {
    apiKey: "",
    aiProvider: "openai",
    modelName: "",
    captureFrequency: 5,
    customPrompt: "",
  },
  (items) => {
    apiKeyInput.value = items.apiKey;
    providerSelect.value = items.aiProvider;
    modelNameInput.value = items.modelName;
    captureFreqInput.value = items.captureFrequency;
    customPromptInput.value = items.customPrompt;
  }
);

// ─── Save settings ──────────────────────────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();

  chrome.storage.sync.set(
    {
      apiKey: apiKeyInput.value.trim(),
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
