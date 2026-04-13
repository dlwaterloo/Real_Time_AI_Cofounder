// ─── State ───────────────────────────────────────────────────────────────────
let isCapturing = false;
let activeTabId = null;

const ALARM_NAME = "ai-cofounder-capture";

// ─── Side-panel setup ────────────────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// ─── Alarm listener (replaces setInterval for MV3 reliability) ───────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME && isCapturing && activeTabId !== null) {
    captureAndAnalyze(activeTabId);
  }
});

// ─── Message router ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case "startCapture":
      startCapture(message.tabId);
      sendResponse({ status: "started" });
      break;

    case "stopCapture":
      stopCapture();
      sendResponse({ status: "stopped" });
      break;

    case "getStatus":
      sendResponse({ isCapturing });
      break;

    case "analyzeNow":
      captureAndAnalyze(message.tabId);
      sendResponse({ status: "analyzing" });
      break;

    default:
      sendResponse({ error: "Unknown action" });
  }
  return true; // keep channel open for async
});

// ─── Capture loop using chrome.alarms ────────────────────────────────────────
async function startCapture(tabId) {
  if (isCapturing) return;
  isCapturing = true;
  activeTabId = tabId;

  // Read frequency from storage (non-secret settings stay in sync)
  const settings = await chrome.storage.sync.get({
    captureFrequency: 5,
  });
  const periodMinutes = Math.max(settings.captureFrequency / 60, 0.5);

  broadcastStatus();

  // Fire immediately, then repeat via alarm
  captureAndAnalyze(tabId);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: periodMinutes });
}

async function stopCapture() {
  isCapturing = false;
  activeTabId = null;
  await chrome.alarms.clear(ALARM_NAME);
  broadcastStatus();
}

// ─── Screenshot + AI analysis ────────────────────────────────────────────────
async function captureAndAnalyze(tabId) {
  try {
    // Notify sidepanel that analysis started
    broadcast({ type: "analysisStarted" });

    // 1. Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "jpeg",
      quality: 80,
    });

    // 2. Grab the current tab URL + title for context
    const tab = await chrome.tabs.get(tabId);

    // 3. Send to AI
    const feedback = await analyzeWithAI(dataUrl, tab.url, tab.title);

    // 4. Broadcast result to sidepanel
    broadcast({
      type: "analysisResult",
      data: {
        feedback,
        timestamp: new Date().toISOString(),
        url: tab.url,
        title: tab.title,
        screenshot: dataUrl,
      },
    });
  } catch (err) {
    console.error("Capture/analysis error:", err);
    broadcast({
      type: "analysisError",
      data: { error: err.message },
    });
  }
}

// ─── AI integration ──────────────────────────────────────────────────────────
async function analyzeWithAI(screenshotDataUrl, pageUrl, pageTitle) {
  // API key is stored in local storage (not synced across devices for security)
  const localSettings = await chrome.storage.local.get({ apiKey: "" });
  const syncSettings = await chrome.storage.sync.get({
    aiProvider: "openai",
    customPrompt: "",
    modelName: "",
  });

  const apiKey = localSettings.apiKey;
  if (!apiKey) {
    throw new Error(
      "API key not configured. Please set your API key in the extension options."
    );
  }

  const systemPrompt = `You are a real-time AI co-founder assistant. You are looking at a user's browser screen and providing helpful feedback, insights, and suggestions. Be concise, actionable, and insightful. Focus on what you can see on the screen and provide value.

The user is currently viewing: ${pageTitle} (${pageUrl})

${syncSettings.customPrompt ? "Additional context from user: " + syncSettings.customPrompt : ""}`;

  const base64Image = screenshotDataUrl.split(",")[1];

  if (syncSettings.aiProvider === "openai") {
    return callOpenAI(apiKey, systemPrompt, base64Image, syncSettings.modelName);
  } else if (syncSettings.aiProvider === "anthropic") {
    return callAnthropic(apiKey, systemPrompt, base64Image, syncSettings.modelName);
  } else {
    throw new Error("Unknown AI provider: " + syncSettings.aiProvider);
  }
}

async function callOpenAI(apiKey, systemPrompt, base64Image, modelName) {
  const model = modelName || "gpt-4o";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "auto",
              },
            },
            {
              type: "text",
              text: "What do you see on this screen? Provide concise, actionable feedback and suggestions.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey, systemPrompt, base64Image, modelName) {
  const model = modelName || "claude-sonnet-4-20250514";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: "What do you see on this screen? Provide concise, actionable feedback and suggestions.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // sidepanel may not be open – that's fine
  });
}

function broadcastStatus() {
  broadcast({ type: "statusUpdate", data: { isCapturing } });
}
