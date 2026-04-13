# Real-Time AI Cofounder — Chrome Extension

A Chrome extension that captures your browser tab as a **live video stream** and provides **streaming AI-powered feedback** in real time via a side panel.

## Features

- **Real-time video capture** — uses `chrome.tabCapture` to stream the active tab as a live video
- **Live video preview** — see exactly what the AI sees in the side panel with a LIVE badge
- **Streaming AI feedback** — responses appear token-by-token as they are generated (SSE streaming)
- **Multiple AI providers** — supports **OpenAI** (GPT-4o) and **Anthropic** (Claude) out of the box
- **Configurable frame sampling** — set how often frames are extracted from the video (1–60 seconds, default 2s)
- **Custom context prompt** — tell the AI what you're working on for more relevant feedback
- **Side panel feed** — past feedback cards with screenshots scroll below the live stream
- **Stop from anywhere** — stop button in both the popup and the side panel

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/dlwaterloo/Real_Time_AI_Cofounder.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`.

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the root folder of this repository.

5. The extension icon will appear in your toolbar.

## Setup

1. Click the extension icon → **⚙ Settings** (or right-click the icon → *Options*).
2. Choose your AI provider (**OpenAI** or **Anthropic**).
3. Paste your API key.
4. *(Optional)* Override the model name, adjust the frame sampling interval, or add a custom context prompt.
5. Click **Save Settings**.

## Usage

1. Navigate to any webpage you want analyzed.
2. Click the extension icon to open the popup.
3. Click **▶ Start Monitoring** — the side panel opens automatically with a live video preview.
4. AI feedback streams in real time below the video. Completed responses move into a scrollable feed.
5. Click **⏹ Stop** in the popup or side panel to end monitoring.

## Project Structure

```
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — state management & tabCapture stream IDs
├── popup/                 # Popup UI (start/stop controls)
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── sidepanel/             # Side panel — live video, streaming AI, feedback feed
│   ├── sidepanel.html
│   ├── sidepanel.js       # Video stream, frame extraction, streaming API calls
│   └── sidepanel.css
├── options/               # Options page (API key & settings)
│   ├── options.html
│   ├── options.js
│   └── options.css
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## How It Works

1. **Video Stream** — The background service worker calls `chrome.tabCapture.getMediaStreamId()` to obtain a stream ID for the active tab. The side panel uses `navigator.mediaDevices.getUserMedia()` with this ID to create a live `MediaStream`.
2. **Live Preview** — The video stream is displayed in a `<video>` element in the side panel with a LIVE badge overlay.
3. **Frame Sampling** — At the configured interval (default 2 seconds), a frame is extracted from the video via an off-screen `<canvas>` and converted to a JPEG data URL.
4. **Streaming AI Analysis** — The frame is sent to the configured vision model API (OpenAI or Anthropic) with `stream: true`. The response is parsed as Server-Sent Events (SSE), and tokens are rendered in the side panel as they arrive with a blinking cursor.
5. **Feed** — Once a streaming response completes, it becomes a card in the scrollable feed along with the captured frame thumbnail.
6. **Repeat** — The next frame is captured as soon as the previous analysis completes (or at the next interval tick), creating a continuous feedback loop.

## Requirements

- Chrome 116+ (for Side Panel and tabCapture APIs)
- An API key for [OpenAI](https://platform.openai.com/api-keys) or [Anthropic](https://console.anthropic.com/)

## Privacy

- Captured frames are sent directly from your browser to the AI provider's API. No data is stored on any intermediate server.
- Your API key is stored locally in Chrome's `chrome.storage.local` (device-only, not synced across browsers) and is never shared.

## License

MIT
