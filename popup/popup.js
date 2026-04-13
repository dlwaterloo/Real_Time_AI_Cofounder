const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnAnalyze = document.getElementById("btn-analyze");
const btnSidePanel = document.getElementById("btn-sidepanel");
const btnOptions = document.getElementById("btn-options");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const errorMsg = document.getElementById("error-msg");

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
}

function clearError() {
  errorMsg.classList.add("hidden");
}

function updateUI(capturing) {
  if (capturing) {
    statusBar.className = "status-bar running";
    statusText.textContent = "Monitoring…";
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    statusBar.className = "status-bar stopped";
    statusText.textContent = "Stopped";
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
}

async function currentTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// ─── Init ────────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ action: "getStatus" }, (res) => {
  if (res) updateUI(res.isCapturing);
});

// ─── Button handlers ─────────────────────────────────────────────────────────
btnStart.addEventListener("click", async () => {
  clearError();
  const tabId = await currentTabId();
  if (!tabId) return showError("No active tab found.");
  chrome.runtime.sendMessage({ action: "startCapture", tabId }, (res) => {
    if (res?.status === "started") updateUI(true);
  });
});

btnStop.addEventListener("click", () => {
  clearError();
  chrome.runtime.sendMessage({ action: "stopCapture" }, (res) => {
    if (res?.status === "stopped") updateUI(false);
  });
});

btnAnalyze.addEventListener("click", async () => {
  clearError();
  const tabId = await currentTabId();
  if (!tabId) return showError("No active tab found.");
  chrome.runtime.sendMessage({ action: "analyzeNow", tabId });
});

btnSidePanel.addEventListener("click", async () => {
  const tabId = await currentTabId();
  if (tabId) {
    chrome.sidePanel.open({ tabId });
  }
});

btnOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ─── Listen for status broadcasts ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "statusUpdate") updateUI(msg.data.isCapturing);
});
