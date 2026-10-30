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

Browser integration tests run in real headless Chromium:

```sh
npx playwright install chromium
npm run test:integration
# Or use an existing installed browser:
CHROMIUM_PATH=/usr/bin/chromium npm run test:integration
```

The integration tests cover automatic and manually selected currency tools, the API request parameters, conversion arithmetic and rounding, missing rates, the Just chat opt-out, and preservation of conversion parameters when a model is available. Exchange-rate responses are fixed test fixtures; native model generation is either disabled or mocked. Tests do not download an AI model or claim to verify live provider availability. GitHub Actions runs these browser tests before deployment.

## Local AI

Start typing in the centered composer and send a message. The first prompt automatically starts the local model, without a setup dialog; the conversation shows download progress and continues with your original prompt when ready. The initial model download can be several gigabytes. Stop cancels setup as well as generation, and another message retries a failed or cancelled setup. No model is downloaded on page load. Actual availability depends on browser version, OS, hardware, region, available storage, and the browser's rollout or experimental settings. Use HTTPS in production; `localhost` is suitable for development. See [Chrome's Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api) for current requirements and setup instructions.

The app feature-detects `window.LanguageModel` and calls `availability()` with English text inputs and outputs. It creates a system-prompt session, clones it per turn, and streams text deltas via `promptStreaming()`. Only a bounded recent history goes into each turn. Cloned sessions are destroyed after use; Stop cancels the active operation. Switching conversations cannot leak another chat's model context. English is the explicitly supported model language. Other browsers work when they expose this API and support the requested configuration.

Unsupported browsers show setup guidance, rather than invented AI replies. The explicit public tools remain usable without a model. Real hardware inference must be tested on an eligible browser; automated tests exercise the API contract with a mock, not a downloaded model.

## A few free tools

**Auto tools is enabled by default.** Ask naturally, for example “What's the weather in Vancouver?” or “Search GitHub for React chat apps”. The local model chooses one tool and its query using a constrained JSON plan. If planning fails or local AI is unavailable, conservative patterns still handle explicit provider requests. General writing, coding, and casual chat stay local. Choose **Just chat** to disable all automatic tool requests, or select a specific tool for an exact lookup using the inputs below. Source cards show the returned facts alongside generated answers.

| Tool           | Example input             | Public service / limits                                                                                                  |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Wikipedia      | `Octopus`                 | MediaWiki search and plaintext extracts, 3 articles. CC BY-SA attribution and article links.                             |
| GitHub         | `react markdown`          | Public repository search. Usually 60 unauthenticated requests/hour and 10 search requests/minute per IP.                 |
| OpenStreetMap  | `Stanley Park, Vancouver` | Nominatim, manual searches only, maximum 1 request/second per browser. © OpenStreetMap contributors (ODbL).              |
| Weather        | `Vancouver`               | Open-Meteo and GeoNames, 3-day forecast in °C. CC BY 4.0, non-commercial free tier, 10,000 calls/day.                    |
| IP lookup      | `1.1.1.1`                 | ipwho.is, explicit address or user-requested public-IP detection. Non-commercial free endpoint, 60 requests/minute; free-tier CORS availability may vary. |
| Exchange rates | `USD`                     | Frankfurter daily reference rates, no key. Not live market or stock prices.                                              |

OpenStreetMap place results include an interactive, lazy-loaded map in the conversation, with a marker, pan/zoom controls, attribution, and a place link for opening the full map. Map embeds contact OpenStreetMap separately from the Nominatim search; saved chats retain the coordinates. Older saved results without coordinates continue to show links.

Limits and terms can change. Tools do not use a proxy, authentication, autocomplete, tracking, automatic geolocation, or background polling. Provider CORS restrictions, outages, and rate limits are surfaced as failures; no insecure relay is used to bypass them. Requests time out after 15 seconds and successful responses are cached in memory for 5 minutes. Nominatim's limit is per browser: a high-traffic deployment should replace the shared public endpoint with a suitable hosted geocoding provider. Review providers' current terms before commercial use.

In **Just chat**, no prompt or conversation is sent to a server. Tools send their query to the selected provider, which also sees your IP. Auto mode sends a locally generated search query, never the full conversation. Model installation is managed by the browser and can use the network. There are no analytics, remotely loaded fonts, or external image requests from Markdown.

Currency conversions such as **“Convert 1 USD to CAD”** use a local extraction tool to produce `{ amount: 1, from: "USD", to: "CAD" }`, then fetch base-currency reference rates and calculate the answer in TypeScript. Explicit conversions bypass model planning so a small model cannot drop the amount or destination code. This works in Auto mode, with Exchange rates manually selected, and without local AI. The source card includes the calculation, rate date, and rounded result. Enter explicit three-letter codes; ambiguous symbols and missing parameters are not guessed. A bare code such as `USD` still shows reference rates.

## Read a website

Paste a URL or ask **“Read https://example.com/”** / **“Summarize https://example.com/”** in Auto mode, or select **Read website**. The tool fetches HTML/plain text directly, omits credentials and referrer information, extracts up to 8,000 characters, and passes the fetched text to the local model. Without a model, the text is shown in a source card. No remote scripts, images, or frames are loaded, and links open in a separate tab rather than navigating away from your conversation.

Most websites do not allow browser cross-origin reads (**CORS**). Regional restrictions, sign-in, mixed-content policies, and outages can also prevent access. A readable HTTP error is reported when available; otherwise the browser does not reveal the exact cause. CheapGPT shows an explanation and an original-site link, without generating a summary of missing content or using a proxy to bypass restrictions. JavaScript-rendered pages, authenticated content, PDFs, and other downloads are not supported. Requests time out after 15 seconds, and response bodies are limited to 1 MB. Website integration tests include actual browser CORS enforcement against a second local origin.

## Conversations

History is stored in this browser's `localStorage`, with up to 50 conversations. It supports search, deletion, switching chats, Markdown export, and response copying. **Remember conversations** can disable persistence; **Delete all chats** clears it. Browser storage is not encrypted and clearing site data deletes history. Incomplete streamed responses may survive a reload as partial text. No server storage or account is involved.

## GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tests and builds pull requests, and deploys successful pushes to **`main`** using the official GitHub Pages artifact and deployment actions. Vite uses relative assets so the SPA works at a repository subpath. Chat navigation uses local state, so no rewrite rules or router fallback are needed.

For a new repository, select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. GitHub's built-in workflow token cannot perform this initial enablement. Check **Settings → Environments → github-pages** if branch restrictions or deployment approval rules are configured. Subsequent pushes to `main` deploy automatically; after changing that setting, rerun any failed initial deployment from the Actions tab.

Default project URL: `https://predatorray.github.io/CheapGPT/`. An existing GitHub Pages account custom domain can redirect this URL. The initial successful deployment reported `http://www.predatorray.me/CheapGPT/`.

**Local AI requires a secure context.** For a custom domain, configure a valid certificate and enable **Enforce HTTPS** in GitHub Pages settings. HTTP visitors get an explicit warning and an HTTPS link in local AI setup; public tools remain usable. Check that the HTTPS variant works before enabling local AI. The deployment action verifies publishing; it does not verify the custom domain's certificate or DNS.

## License

[MIT](LICENSE) © 2026 Wenhao Ji <predator.ray@gmail.com>.

An independent parody project, not affiliated with OpenAI or ChatGPT. Small model. Big confidence.

### Conversation titles

History starts with the first message as a fallback. Once the local model is ready, a short title is generated after eight idle seconds. Title work uses a small context, is cancelled when you send a message, and times out after a minute. It runs only at completed-round checkpoints 1, 4, and 7; an unchanged topic freezes the title early. Titles stop updating after round 7.

Ask “Rename this conversation to Garden plans” to use the local `rename_conversation` tool. Auto tools also exposes this action to the model planner. A rename permanently disables automatic titles for that conversation, including after reloading saved history. No conversation data leaves the device for naming.

### Your public IP

Ask **“What’s my IP address?”** in Auto mode, or select IP lookup and enter “my IP”. CheapGPT requests **https://ipwho.is/** without an address parameter, so the service detects the browser’s public egress IP. Explicit address lookups still use `/ADDRESS`. Current-IP requests bypass model planning and both app/browser caches. The answer displays the service response directly, so the model cannot replace it with an example such as 1.1.1.1. No IP request runs on page load. VPNs/proxies can change the public IP, and IP geolocation is approximate. CORS or service failures produce an error, not an invented IP.
