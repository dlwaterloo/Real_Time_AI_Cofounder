// ─── DOM elements ────────────────────────────────────────────────────────────
const feed = document.getElementById("feed");
const emptyState = document.getElementById("empty-state");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const videoContainer = document.getElementById("video-container");
const videoEl = document.getElementById("preview");
const streamingCard = document.getElementById("streaming-card");
const streamingBody = document.getElementById("streaming-body");
const streamingTime = document.getElementById("streaming-time");
const btnStop = document.getElementById("btn-stop");

// ─── State ───────────────────────────────────────────────────────────────────
let mediaStream = null;
let frameTimer = null;
let geminiWs = null;
let geminiReady = false;
let currentResponseText = "";
let isReceivingResponse = false;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

// Gemini Live API constants
const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

// ─── Render helpers ──────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusEl.className = "status " + state;
  statusText.textContent = text;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  html = html.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  return "<p>" + html + "</p>";
}

// ─── Gemini Live WebSocket ──────────────────────────────────────────────────
async function connectGemini(apiKey, systemPrompt) {
  return new Promise((resolve, reject) => {
    const wsUrl = GEMINI_WS_BASE + "?key=" + apiKey;
    geminiWs = new WebSocket(wsUrl);

    geminiWs.onopen = () => {
      console.log("[Gemini] WebSocket connected, sending setup");

      const setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-latest",
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
        },
      };
      console.log("[Gemini] Sending setup:", JSON.stringify(setupMsg));
      geminiWs.send(JSON.stringify(setupMsg));
    };

    geminiWs.onmessage = async (event) => {
      // Parse message data (may be text string or Blob)
      let data;
      try {
        if (event.data instanceof Blob) {
          const text = await event.data.text();
          data = JSON.parse(text);
        } else {
          data = JSON.parse(event.data);
        }
      } catch (err) {
        console.error("[Gemini] Failed to parse message in onmessage:", err);
        return;
      }

      // Resolve the promise once setup is complete
      if (!geminiReady && data.setupComplete) {
        geminiReady = true;
        console.log("[Gemini] Setup complete, ready for video frames");
        resolve();
        return;
      }

      // Forward to response handler
      handleGeminiResponse(data);
    };

    geminiWs.onerror = (err) => {
      console.error("[Gemini] WebSocket error:", err);
      reject(new Error("Gemini WebSocket connection failed"));
    };

    geminiWs.onclose = (event) => {
      console.log("[Gemini] WebSocket closed:", event.code, event.reason);
      geminiReady = false;
      geminiWs = null;
    };

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!geminiReady) {
        reject(new Error("Gemini WebSocket setup timed out"));
      }
    }, 10000);
  });
}

function handleGeminiResponse(data) {
  // Setup complete — handled in connectGemini promise
  if (data.setupComplete) return;

  const serverContent = data.serverContent;
  if (!serverContent) return;

  // Text content from model turn
  const parts = serverContent.modelTurn?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.text) {
        if (!isReceivingResponse) {
          // First token — show streaming card
          isReceivingResponse = true;
          streamingCard.classList.remove("hidden");
          streamingBody.innerHTML = '<span class="cursor-blink"></span>';
          streamingTime.textContent = formatTime(new Date().toISOString());
          currentResponseText = "";
        }
        currentResponseText += part.text;
        appendStreamingToken(part.text);
      }
    }
  }

  // Interrupted — the model was interrupted by new input
  if (serverContent.interrupted) {
    console.log("[Gemini] Response interrupted by new input");
  }

  // Turn complete — finalize current response
  if (serverContent.turnComplete) {
    if (isReceivingResponse && currentResponseText.trim()) {
      streamingCard.classList.add("hidden");
      addCard({
        feedback: currentResponseText,
        timestamp: new Date().toISOString(),
      });
    }
    isReceivingResponse = false;
    currentResponseText = "";
  }
}

function sendVideoFrame(base64Jpeg) {
  if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN || !geminiReady) {
    return;
  }

  const msg = {
    realtimeInput: {
      video: {
        mimeType: "image/jpeg",
        data: base64Jpeg,
      },
    },
  };
  geminiWs.send(JSON.stringify(msg));
}

function disconnectGemini() {
  geminiReady = false;
  if (geminiWs) {
    geminiWs.close();
    geminiWs = null;
  }
}

// ─── Video stream ────────────────────────────────────────────────────────────
async function startStream(streamId) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });

    videoEl.srcObject = mediaStream;
    videoContainer.classList.remove("hidden");
    emptyState.style.display = "none";
    btnStop.classList.remove("hidden");
    setStatus("running", "Live — Connecting to Gemini");

    // Load settings and connect to Gemini
    const localSettings = await chrome.storage.local.get({ apiKey: "" });
    const syncSettings = await chrome.storage.sync.get({
      customPrompt: "",
      captureFrequency: 1,
    });

    const apiKey = localSettings.apiKey;
    if (!apiKey) {
      addCard({
        error:
          "Gemini API key not configured. Please set your API key in the extension options.",
        timestamp: new Date().toISOString(),
      });
      setStatus("running", "Live — No API key");
      return;
    }

    // Get current tab info for context
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = tabs[0];
    const pageTitle = tab?.title || "Unknown";
    const pageUrl = tab?.url || "";

    const systemPrompt =
      "You are a real-time AI co-founder watching a live video stream of a user's browser tab. " +
      "You receive continuous video frames and should provide concise, actionable feedback as things change on screen. " +
      "Be brief and focus on what's most important. Do not repeat yourself if the screen hasn't changed.\n\n" +
      "Currently viewing: " + pageTitle + " (" + pageUrl + ")" +
      (syncSettings.customPrompt
        ? "\n\nAdditional context: " + syncSettings.customPrompt
        : "");

    try {
      await connectGemini(apiKey, systemPrompt);
      setStatus("running", "Live — Streaming to Gemini");

      // Start sending video frames at configured interval
      const intervalMs = Math.max(syncSettings.captureFrequency * 1000, 1000);

      videoEl.addEventListener(
        "loadeddata",
        () => {
          sendCurrentFrame();
          frameTimer = setInterval(sendCurrentFrame, intervalMs);
        },
        { once: true }
      );

      // If video is already loaded
      if (videoEl.readyState >= 2) {
        sendCurrentFrame();
        frameTimer = setInterval(sendCurrentFrame, intervalMs);
      }
    } catch (err) {
      console.error("[Gemini] Connection error:", err);
      addCard({
        error: "Failed to connect to Gemini: " + err.message,
        timestamp: new Date().toISOString(),
      });
      setStatus("running", "Live — Gemini disconnected");
    }
  } catch (err) {
    console.error("Stream setup error:", err);
    addCard({
      error: "Failed to start video capture: " + err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

function sendCurrentFrame() {
  if (!mediaStream || !videoEl.videoWidth) return;

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  ctx.drawImage(videoEl, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
  const base64 = dataUrl.split(",")[1];
  sendVideoFrame(base64);
}

function stopStream() {
  if (frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }
  disconnectGemini();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  videoEl.srcObject = null;
  videoContainer.classList.add("hidden");
  streamingCard.classList.add("hidden");
  btnStop.classList.add("hidden");
  isReceivingResponse = false;
  currentResponseText = "";
  setStatus("stopped", "Stopped");

  chrome.runtime.sendMessage({ action: "stopCapture" });
}

function appendStreamingToken(text) {
  // Remove cursor, append text, re-add cursor
  const cursor = streamingBody.querySelector(".cursor-blink");
  if (cursor) cursor.remove();
  streamingBody.appendChild(document.createTextNode(text));
  const newCursor = document.createElement("span");
  newCursor.className = "cursor-blink";
  streamingBody.appendChild(newCursor);
  streamingBody.scrollTop = streamingBody.scrollHeight;
}

// ─── Feed cards ──────────────────────────────────────────────────────────────
function addCard({ feedback, timestamp, url, title, screenshot, error }) {
  emptyState.style.display = "none";

  const card = document.createElement("div");
  card.className = "card" + (error ? " error" : "");

  const safeTitle = escapeHTML(title || url || "Screen");
  const safeTime = escapeHTML(
    formatTime(timestamp || new Date().toISOString())
  );

  const headerHTML = `
    <div class="card-header">
      <span class="card-title">${safeTitle}</span>
      <span class="card-time">${safeTime}</span>
    </div>`;

  let bodyHTML = "";
  if (error) {
    bodyHTML = `<div class="card-body"><p>${escapeHTML(error)}</p></div>`;
  } else {
    const screenshotHTML = screenshot
      ? `<img class="card-screenshot" src="${screenshot}" alt="Frame" />`
      : "";
    bodyHTML = `${screenshotHTML}<div class="card-body">${renderMarkdown(feedback)}</div>`;
  }

  card.innerHTML = headerHTML + bodyHTML;

  // Keep only last 20 cards to save memory
  while (feed.children.length >= 20) {
    feed.removeChild(feed.lastChild);
  }

  feed.prepend(card);
}

// ─── Stop button ─────────────────────────────────────────────────────────────
btnStop.addEventListener("click", stopStream);

// ─── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "statusUpdate":
      if (!msg.data.isCapturing && mediaStream) {
        stopStream();
      } else if (msg.data.isCapturing && !mediaStream) {
        setStatus("running", "Live — Waiting for stream…");
        emptyState.style.display = "none";
        btnStop.classList.remove("hidden");
        // Request a fresh stream for this side-panel
        chrome.runtime.sendMessage(
          { action: "getStreamId", tabId: msg.data.activeTabId },
          (res) => {
            if (res?.streamId) startStream(res.streamId);
            else if (res?.error) addCard({ error: res.error, timestamp: new Date().toISOString() });
          }
        );
      }
      break;

    case "stopStream":
      if (mediaStream) stopStream();
      break;
  }
});

// ─── On load: reconnect if already capturing ─────────────────────────────────
chrome.runtime.sendMessage({ action: "getStatus" }, (res) => {
  if (res?.isCapturing && res.activeTabId) {
    setStatus("running", "Live — Reconnecting…");
    emptyState.style.display = "none";
    btnStop.classList.remove("hidden");
    chrome.runtime.sendMessage(
      { action: "getStreamId", tabId: res.activeTabId },
      (streamRes) => {
        if (streamRes?.streamId) startStream(streamRes.streamId);
        else if (streamRes?.error)
          addCard({ error: streamRes.error, timestamp: new Date().toISOString() });
      }
    );
  }
});
