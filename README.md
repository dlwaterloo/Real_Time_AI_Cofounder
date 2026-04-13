# Real-Time AI Cofounder — Chrome Extension

A Chrome extension that captures your browser screen in real time and provides AI-powered feedback, insights, and suggestions via a convenient side panel.

## Features

- **Real-time screen capture** — periodically captures the visible tab and sends it to an AI vision model
- **AI-powered feedback** — get actionable insights, suggestions, and observations about what's on your screen
- **Side panel UI** — feedback appears in a sleek, scrollable feed right beside your content
- **Multiple AI providers** — supports **OpenAI** (GPT-4o) and **Anthropic** (Claude) out of the box
- **Configurable capture frequency** — set how often the screen is analyzed (2–120 seconds)
- **Custom context prompt** — tell the AI what you're working on for more relevant feedback
- **One-click analysis** — trigger an immediate capture and analysis anytime

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
4. *(Optional)* Override the model name, adjust capture frequency, or add a custom context prompt.
5. Click **Save Settings**.

## Usage

1. Navigate to any webpage you want analyzed.
2. Click the extension icon to open the popup.
3. Click **▶ Start Monitoring** to begin real-time capture and analysis.
4. Click **Open Side Panel** to see the AI feedback feed.
5. Use **📸 Analyze Now** for an on-demand one-shot analysis.
6. Click **⏹ Stop** to pause monitoring.

## Project Structure

```
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — capture loop & AI API calls
├── popup/                 # Popup UI (start/stop controls)
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── sidepanel/             # Side panel UI (feedback feed)
│   ├── sidepanel.html
│   ├── sidepanel.js
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

1. **Screen Capture** — Uses `chrome.tabs.captureVisibleTab()` to take a JPEG screenshot of the active tab.
2. **AI Analysis** — Sends the screenshot (as base64) to the configured vision model (OpenAI or Anthropic) along with the page URL/title and any custom context.
3. **Feedback Display** — The AI response is streamed back and rendered as a card in the side panel, complete with a thumbnail of the captured screenshot and a timestamp.
4. **Repeat** — The cycle repeats at the configured interval until the user stops monitoring.

## Requirements

- Chrome 116+ (for Side Panel API support)
- An API key for [OpenAI](https://platform.openai.com/api-keys) or [Anthropic](https://console.anthropic.com/)

## Privacy

- Screenshots are sent directly from your browser to the AI provider's API. No data is stored on any intermediate server.
- Your API key is stored locally in Chrome's `chrome.storage.local` (device-only, not synced across browsers) and is never shared.

## License

MIT
