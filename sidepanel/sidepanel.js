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
let captureTimer = null;
let isAnalyzing = false;
let currentAbort = null;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

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
    setStatus("running", "Live — Monitoring active");

    // Start the capture loop once video is ready
    const settings = await chrome.storage.sync.get({ captureFrequency: 2 });
    const intervalMs = Math.max(settings.captureFrequency * 1000, 1000);

    videoEl.addEventListener(
      "loadeddata",
      () => {
        analyzeCurrentFrame();
        captureTimer = setInterval(() => {
          if (!isAnalyzing) analyzeCurrentFrame();
        }, intervalMs);
      },
      { once: true }
    );
  } catch (err) {
    console.error("Stream setup error:", err);
    addCard({
      error: "Failed to start video capture: " + err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

function stopStream() {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  videoEl.srcObject = null;
  videoContainer.classList.add("hidden");
  streamingCard.classList.add("hidden");
  btnStop.classList.add("hidden");
  isAnalyzing = false;
  setStatus("stopped", "Stopped");

  chrome.runtime.sendMessage({ action: "stopCapture" });
}

// ─── Frame capture & streaming analysis ──────────────────────────────────────
async function analyzeCurrentFrame() {
  if (!mediaStream || !videoEl.videoWidth) return;

  isAnalyzing = true;
  const timestamp = new Date().toISOString();

  // Grab a frame from the live video
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  ctx.drawImage(videoEl, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  const base64Image = dataUrl.split(",")[1];

  setStatus("analyzing", "Analyzing frame…");

  // Show streaming card with blinking cursor
  streamingCard.classList.remove("hidden");
  streamingBody.innerHTML = '<span class="cursor-blink"></span>';
  streamingTime.textContent = formatTime(timestamp);

  try {
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

    // Get current tab info for context
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = tabs[0];
    const pageTitle = tab?.title || "Unknown";
    const pageUrl = tab?.url || "";

    const systemPrompt = `You are a real-time AI co-founder watching a live video feed of a user's browser. Provide concise, actionable feedback. Be brief — you will be called frequently.

Currently viewing: ${pageTitle} (${pageUrl})

${syncSettings.customPrompt ? "Context: " + syncSettings.customPrompt : ""}`;

    const fullText = await streamAnalysis(
      syncSettings.aiProvider,
      apiKey,
      systemPrompt,
      base64Image,
      syncSettings.modelName
    );

    // Move completed response into feed
    streamingCard.classList.add("hidden");
    addCard({
      feedback: fullText,
      timestamp,
      url: pageUrl,
      title: pageTitle,
      screenshot: dataUrl,
    });

    setStatus("running", "Live — Monitoring active");
  } catch (err) {
    console.error("Analysis error:", err);
    streamingCard.classList.add("hidden");
    addCard({ error: err.message, timestamp });
    setStatus("running", "Live — Monitoring active");
  }

  isAnalyzing = false;
}

// ─── Streaming AI calls ─────────────────────────────────────────────────────
async function streamAnalysis(
  provider,
  apiKey,
  systemPrompt,
  base64Image,
  modelName
) {
  currentAbort = new AbortController();

  if (provider === "openai") {
    return streamOpenAI(
      apiKey,
      systemPrompt,
      base64Image,
      modelName,
      currentAbort.signal
    );
  } else if (provider === "anthropic") {
    return streamAnthropic(
      apiKey,
      systemPrompt,
      base64Image,
      modelName,
      currentAbort.signal
    );
  }
  throw new Error("Unknown AI provider: " + provider);
}

async function streamOpenAI(apiKey, systemPrompt, base64Image, modelName, signal) {
  const model = modelName || "gpt-4o";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: "What do you see? Brief, actionable feedback.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  return readSSE(response, (chunk) => {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) appendStreamingToken(content);
    return content || "";
  });
}

async function streamAnthropic(
  apiKey,
  systemPrompt,
  base64Image,
  modelName,
  signal
) {
  const model = modelName || "claude-sonnet-4-20250514";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      stream: true,
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
              text: "What do you see? Brief, actionable feedback.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  return readSSE(response, (chunk) => {
    if (chunk.type === "content_block_delta" && chunk.delta?.text) {
      appendStreamingToken(chunk.delta.text);
      return chunk.delta.text;
    }
    return "";
  });
}

// ─── SSE parser ──────────────────────────────────────────────────────────────
async function readSSE(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          fullText += onChunk(parsed);
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  return fullText;
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
