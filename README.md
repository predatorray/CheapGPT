# CheapGPT

**Big ideas. Tiny budget.** A minimalist, gently teasing AI chat app built with TypeScript, React, and MUI. Inference runs on your device through the browser's `LanguageModel` (Prompt) API. No remote AI API, API keys, backend, or subscription.

## Run locally

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

## Local AI

Open **Set up local AI → Enable local AI**. Model creation is always an explicit user action: the initial model download can be several gigabytes. Actual availability depends on browser version, OS, hardware, region, available storage, and the browser's rollout or experimental settings. Use HTTPS in production; `localhost` is suitable for development. See [Chrome's Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api) for current requirements and setup instructions.

The app feature-detects `window.LanguageModel` and calls `availability()` with English text inputs and outputs. It creates a system-prompt session, clones it per turn, and streams text deltas via `promptStreaming()`. Only a bounded recent history goes into each turn. Cloned sessions are destroyed after use; Stop cancels the active operation. Switching conversations cannot leak another chat's model context. English is the explicitly supported model language. Other browsers work when they expose this API and support the requested configuration.

Unsupported browsers show setup guidance, rather than invented AI replies. The explicit public tools remain usable without a model. Real hardware inference must be tested on an eligible browser; automated tests exercise the API contract with a mock, not a downloaded model.

## A few free tools

Choose a tool in the composer, then enter its search term. **Auto tools** lets the local model choose one tool and a query before composing an answer; malformed plans fall back to ordinary chat. Source cards always show the actual returned facts alongside generated answers.

| Tool           | Example input             | Public service / limits                                                                                                  |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Wikipedia      | `Octopus`                 | MediaWiki search and plaintext extracts, 3 articles. CC BY-SA attribution and article links.                             |
| GitHub         | `react markdown`          | Public repository search. Usually 60 unauthenticated requests/hour and 10 search requests/minute per IP.                 |
| OpenStreetMap  | `Stanley Park, Vancouver` | Nominatim, manual searches only, maximum 1 request/second per browser. © OpenStreetMap contributors (ODbL).              |
| Weather        | `Vancouver`               | Open-Meteo and GeoNames, 3-day forecast in °C. CC BY 4.0, non-commercial free tier, 10,000 calls/day.                    |
| IP lookup      | `1.1.1.1`                 | ipwho.is, explicit address only. Non-commercial free endpoint, 60 requests/minute; free-tier CORS availability may vary. |
| Exchange rates | `USD`                     | Frankfurter daily reference rates, no key. Not live market or stock prices.                                              |

Limits and terms can change. Tools do not use a proxy, authentication, autocomplete, tracking, automatic geolocation, or background polling. Provider CORS restrictions, outages, and rate limits are surfaced as failures; no insecure relay is used to bypass them. Requests time out after 15 seconds and successful responses are cached in memory for 5 minutes. Nominatim's limit is per browser: a high-traffic deployment should replace the shared public endpoint with a suitable hosted geocoding provider. Review providers' current terms before commercial use.

In **Just chat**, no prompt or conversation is sent to a server. Tools send their query to the selected provider, which also sees your IP. Auto mode sends a locally generated search query, never the full conversation. Model installation is managed by the browser and can use the network. There are no analytics, remotely loaded fonts, or external image requests from Markdown.

## Conversations

History is stored in this browser's `localStorage`, with up to 50 conversations. It supports search, deletion, switching chats, Markdown export, and response copying. **Remember conversations** can disable persistence; **Delete all chats** clears it. Browser storage is not encrypted and clearing site data deletes history. Incomplete streamed responses may survive a reload as partial text. No server storage or account is involved.

## GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tests and builds pull requests, and deploys successful pushes to **`main`** using the official GitHub Pages artifact and deployment actions. Vite uses relative assets so the SPA works at a repository subpath. Chat navigation uses local state, so no rewrite rules or router fallback are needed.

For a new repository, select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. GitHub's built-in workflow token cannot perform this initial enablement. Check **Settings → Environments → github-pages** if branch restrictions or deployment approval rules are configured. Subsequent pushes to `main` deploy automatically; after changing that setting, rerun any failed initial deployment from the Actions tab.

Expected project URL: `https://predatorray.github.io/CheapGPT/` (available after the Pages deployment succeeds).

## License

[MIT](LICENSE) © 2026 Wenhao Ji <predator.ray@gmail.com>.

An independent parody project, not affiliated with OpenAI or ChatGPT. Small model. Big confidence.
