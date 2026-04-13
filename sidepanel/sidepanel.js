// ─── DOM elements ────────────────────────────────────────────────────────────
const emptyState = document.getElementById("empty-state");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const videoContainer = document.getElementById("video-container");
const videoEl = document.getElementById("preview");
const streamOutput = document.getElementById("stream-output");
const streamText = document.getElementById("stream-text");
const btnStop = document.getElementById("btn-stop");

// ─── State ───────────────────────────────────────────────────────────────────
let mediaStream = null;
let frameTimer = null;
let promptTimer = null;
let framesSinceLastPrompt = 0;
let geminiWs = null;
let geminiReady = false;
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

// ─── Streaming text helpers ─────────────────────────────────────────────────
function appendToken(text) {
  // Remove existing cursor
  const cursor = streamText.querySelector(".cursor-blink");
  if (cursor) cursor.remove();

  // Append text
  streamText.appendChild(document.createTextNode(text));

  // Re-add cursor
  const newCursor = document.createElement("span");
  newCursor.className = "cursor-blink";
  streamText.appendChild(newCursor);

  // Auto-scroll to bottom
  streamOutput.scrollTop = streamOutput.scrollHeight;
}

function addSeparator() {
  const cursor = streamText.querySelector(".cursor-blink");
  if (cursor) cursor.remove();

  // Add a visual break between responses
  const sep = document.createElement("div");
  sep.className = "response-separator";
  streamText.appendChild(sep);

  streamOutput.scrollTop = streamOutput.scrollHeight;
}

function showError(message) {
  emptyState.style.display = "none";

  const cursor = streamText.querySelector(".cursor-blink");
  if (cursor) cursor.remove();

  const errorEl = document.createElement("div");
  errorEl.className = "stream-error";
  errorEl.textContent = message;
  streamText.appendChild(errorEl);

  streamOutput.scrollTop = streamOutput.scrollHeight;
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
            responseModalities: ["TEXT"],
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
          // First token of a new response
          isReceivingResponse = true;
          emptyState.style.display = "none";
        }
        appendToken(part.text);
      }
    }
  }

  // Interrupted — the model was interrupted by new input
  if (serverContent.interrupted) {
    console.log("[Gemini] Response interrupted by new input");
  }

  // Turn complete — add separator for next response
  if (serverContent.turnComplete) {
    if (isReceivingResponse) {
      addSeparator();
    }
    isReceivingResponse = false;
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
  framesSinceLastPrompt++;
}

function sendAnalysisPrompt() {
  if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN || !geminiReady) {
    return;
  }
  if (isReceivingResponse) return; // don't interrupt ongoing response
  if (framesSinceLastPrompt < 1) return; // no new frames since last prompt

  const msg = {
    clientContent: {
      turns: [
        {
          role: "user",
          parts: [
            {
              text: "Analyze the current screen content. What do you see? Provide brief, actionable feedback.",
            },
          ],
        },
      ],
      turnComplete: true,
    },
  };
  geminiWs.send(JSON.stringify(msg));
  framesSinceLastPrompt = 0;
  console.log("[Gemini] Sent analysis prompt");
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
      showError("Gemini API key not configured. Please set your API key in the extension options.");
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
      // Prompt for analysis every ~5 seconds (after accumulating frames)
      const promptIntervalMs = 5000;

      const beginStreaming = () => {
        sendCurrentFrame();
        frameTimer = setInterval(sendCurrentFrame, intervalMs);
        promptTimer = setInterval(sendAnalysisPrompt, promptIntervalMs);
        // Send first analysis prompt after a short delay to let frames accumulate
        setTimeout(sendAnalysisPrompt, 3000);
      };

      videoEl.addEventListener("loadeddata", beginStreaming, { once: true });

      // If video is already loaded
      if (videoEl.readyState >= 2) {
        beginStreaming();
      }
    } catch (err) {
      console.error("[Gemini] Connection error:", err);
      showError("Failed to connect to Gemini: " + err.message);
      setStatus("running", "Live — Gemini disconnected");
    }
  } catch (err) {
    console.error("Stream setup error:", err);
    showError("Failed to start video capture: " + err.message);
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
  if (promptTimer) {
    clearInterval(promptTimer);
    promptTimer = null;
  }
  framesSinceLastPrompt = 0;
  disconnectGemini();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  videoEl.srcObject = null;
  videoContainer.classList.add("hidden");
  btnStop.classList.add("hidden");
  isReceivingResponse = false;

  // Remove blinking cursor when stopped
  const cursor = streamText.querySelector(".cursor-blink");
  if (cursor) cursor.remove();

  setStatus("stopped", "Stopped");

  chrome.runtime.sendMessage({ action: "stopCapture" });
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
            else if (res?.error) showError(res.error);
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
        else if (streamRes?.error) showError(streamRes.error);
      }
    );
  }
});
