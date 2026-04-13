const feed = document.getElementById("feed");
const emptyState = document.getElementById("empty-state");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");

// ─── Render helpers ──────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusEl.className = "status " + state;
  statusText.textContent = text;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Very light markdown → HTML (bold, code, lists) */
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // inline code
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  // unordered list items
  html = html.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
  // numbered list items
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  // wrap consecutive <li> runs in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  // paragraphs (double newline)
  html = html.replace(/\n{2,}/g, "</p><p>");
  // single newlines → <br>
  html = html.replace(/\n/g, "<br>");

  return "<p>" + html + "</p>";
}

function addCard({ feedback, timestamp, url, title, screenshot, error }) {
  emptyState.style.display = "none";

  const card = document.createElement("div");
  card.className = "card" + (error ? " error" : "");

  const headerHTML = `
    <div class="card-header">
      <span class="card-title">${title || url || "Screen"}</span>
      <span class="card-time">${formatTime(timestamp || new Date().toISOString())}</span>
    </div>`;

  let bodyHTML = "";
  if (error) {
    bodyHTML = `<div class="card-body"><p>${error}</p></div>`;
  } else {
    const screenshotHTML = screenshot
      ? `<img class="card-screenshot" src="${screenshot}" alt="Screenshot" title="Click to expand" />`
      : "";
    bodyHTML = `${screenshotHTML}<div class="card-body">${renderMarkdown(feedback)}</div>`;
  }

  card.innerHTML = headerHTML + bodyHTML;

  // Click screenshot to open full-size in new tab
  const img = card.querySelector(".card-screenshot");
  if (img) {
    img.addEventListener("click", () => {
      window.open(screenshot, "_blank");
    });
  }

  // Newest at top
  feed.prepend(card);
}

// ─── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "statusUpdate":
      if (msg.data.isCapturing) {
        setStatus("running", "Monitoring active");
      } else {
        setStatus("stopped", "Stopped");
      }
      break;

    case "analysisStarted":
      setStatus("analyzing", "Analyzing screen…");
      break;

    case "analysisResult":
      setStatus("running", "Monitoring active");
      addCard(msg.data);
      break;

    case "analysisError":
      setStatus("running", "Monitoring active");
      addCard({ error: msg.data.error, timestamp: new Date().toISOString() });
      break;
  }
});

// ─── Ask background for current status on load ──────────────────────────────
chrome.runtime.sendMessage({ action: "getStatus" }, (res) => {
  if (res?.isCapturing) {
    setStatus("running", "Monitoring active");
    emptyState.style.display = "none";
  }
});
