# Real-Time AI Cofounder — Chrome Extension

A Chrome extension that streams your browser tab as **live video** to the **Google Gemini Live API** via WebSocket and provides **real-time AI feedback** in a side panel.

## Features

- **Real-time video streaming** — uses `chrome.tabCapture` + Gemini Live API WebSocket for continuous video-to-AI streaming
- **Live video preview** — see exactly what the AI sees in the side panel with a LIVE badge
- **Streaming AI feedback** — responses appear token-by-token as Gemini processes the live video stream
- **Google Gemini Live API** — powered by `gemini-2.0-flash-live-001` with bidirectional WebSocket communication
- **Configurable frame rate** — set how often frames are sent to Gemini (default 1 FPS, Gemini's max for images)
- **Custom context prompt** — tell the AI what you're working on for more relevant feedback
- **Side panel feed** — past feedback cards scroll below the live stream
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
2. Paste your **Google Gemini API key** (get one from [Google AI Studio](https://aistudio.google.com/apikey)).
3. *(Optional)* Adjust the frame rate or add a custom context prompt.
4. Click **Save Settings**.

## Usage

1. Navigate to any webpage you want analyzed.
2. Click the extension icon to open the popup.
3. Click **▶ Start Monitoring** — the side panel opens automatically with a live video preview.
4. The extension connects to Gemini Live API via WebSocket and begins streaming video frames.
5. AI feedback streams in real time below the video. Completed responses move into a scrollable feed.
6. Click **⏹ Stop** in the popup or side panel to end monitoring.

## Project Structure

```
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — state management & tabCapture stream IDs
├── popup/                 # Popup UI (start/stop controls)
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── sidepanel/             # Side panel — live video, Gemini WebSocket, feedback feed
│   ├── sidepanel.html
│   ├── sidepanel.js       # Video stream, Gemini Live WebSocket, real-time feedback
│   └── sidepanel.css
├── options/               # Options page (Gemini API key & settings)
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
3. **WebSocket Connection** — When monitoring starts, the side panel establishes a WebSocket connection to the Gemini Live API (`wss://generativelanguage.googleapis.com/ws/...`) and sends a session setup message with the model configuration and system prompt.
4. **Continuous Video Streaming** — At the configured frame rate (default 1 FPS), frames are extracted from the live video via an off-screen `<canvas>`, converted to JPEG, and sent to Gemini as `realtimeInput` messages over the WebSocket.
5. **Real-time AI Response** — Gemini processes the continuous video stream and sends back text responses in real time. Tokens are rendered in the side panel as they arrive with a blinking cursor.
6. **Feed** — Once Gemini signals `turnComplete`, the response becomes a card in the scrollable feed.
7. **Continuous Loop** — Frames continue streaming to Gemini, which responds proactively when it detects changes or has new observations.

## Architecture

```
┌─────────────┐    tabCapture     ┌─────────────┐
│  Browser Tab │ ──────────────► │  Side Panel  │
│  (any page)  │    MediaStream   │  (video +    │
└─────────────┘                   │   feedback)  │
                                  └──────┬───────┘
                                         │ WebSocket (WSS)
                                         │ JPEG frames @ 1 FPS
                                         ▼
                                  ┌─────────────┐
                                  │ Gemini Live  │
                                  │    API       │
                                  │ (gemini-2.0- │
                                  │  flash-live) │
                                  └──────┬───────┘
                                         │ WebSocket
                                         │ Streaming text
                                         ▼
                                  ┌─────────────┐
                                  │ Side Panel   │
                                  │ (token-by-   │
                                  │  token feed) │
                                  └─────────────┘
```

## Requirements

- Chrome 116+ (for Side Panel and tabCapture APIs)
- A [Google Gemini API key](https://aistudio.google.com/apikey)

## Privacy

- Video frames are sent directly from your browser to Google's Gemini Live API via WebSocket. No data is stored on any intermediate server.
- Your API key is stored locally in Chrome's `chrome.storage.local` (device-only, not synced across browsers) and is never shared.

## License

MIT
