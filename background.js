// ─── State ───────────────────────────────────────────────────────────────────
let isCapturing = false;
let activeTabId = null;

// ─── Side-panel setup ────────────────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// ─── Message router ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case "startCapture":
      handleStartCapture(message.tabId).then(sendResponse);
      return true; // async

    case "stopCapture":
      stopCapture();
      sendResponse({ status: "stopped" });
      break;

    case "getStatus":
      sendResponse({ isCapturing, activeTabId });
      break;

    case "getStreamId":
      getStreamId(message.tabId).then(sendResponse);
      return true; // async

    default:
      sendResponse({ error: "Unknown action" });
  }
  return true;
});

// ─── Start / stop capture ────────────────────────────────────────────────────
async function handleStartCapture(tabId) {
  if (isCapturing) return { status: "already_running" };

  isCapturing = true;
  activeTabId = tabId;
  broadcastStatus();

  return { status: "started", tabId };
}

function stopCapture() {
  isCapturing = false;
  activeTabId = null;
  broadcast({ type: "stopStream" });
  broadcastStatus();
}

// ─── Tab-capture stream ID ───────────────────────────────────────────────────
async function getStreamId(tabId) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });
    return { streamId };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // sidepanel may not be open – that's fine
  });
}

function broadcastStatus() {
  broadcast({ type: "statusUpdate", data: { isCapturing, activeTabId } });
}
