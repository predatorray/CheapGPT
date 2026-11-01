# Technical guide

[← Back to CheapGPT](../README.md)

Browser setup, tool behavior, privacy details, testing, and GitHub Pages deployment.

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

The integration tests cover automatic and manually selected currency tools, the API request parameters, conversion arithmetic and rounding, missing rates, the Just chat opt-out, and preservation of conversion parameters when a model is available. Exchange-rate responses are fixed test fixtures; native decisions are explicitly mocked and unavailable-model behavior is checked. Tests do not download an AI model or claim to verify live provider availability. GitHub Actions runs these browser tests before deployment.

## Local AI

Start typing in the centered composer and send a message. The first prompt automatically starts the local model, without a setup dialog; the conversation shows download progress and continues with your original prompt when ready. The initial model download can be several gigabytes. Stop cancels setup as well as generation, and another message retries a failed or cancelled setup. No model is downloaded on page load. Actual availability depends on browser version, OS, hardware, region, available storage, and the browser's rollout or experimental settings. Use HTTPS in production; `localhost` is suitable for development. See [Chrome's Prompt API guide](https://developer.chrome.com/docs/ai/prompt-api) for current requirements and setup instructions.

The app feature-detects `window.LanguageModel` and calls `availability()` with English text inputs and outputs. It creates a system-prompt session, clones it per turn, and streams text deltas via `promptStreaming()`. Cloned sessions are destroyed after use; Stop cancels the active operation. Switching conversations cannot leak another chat's model context. English is the explicitly supported model language. Other browsers work when they expose this API and support the requested configuration.

### A harness for a small model

- Every submitted prompt requires local AI. There are no phrase-matching routes, fixed task recipes, or model-free replies. Auto tools uses a local-model file-request check, model-generated clauses with a coverage check, then binds and executes tools for those clauses in order with schema-constrained arguments generated from observed results. Just chat goes directly to local model drafting.
- The bounded [task runner](tasks.md) allows six tool calls, typed arguments, successful-result references, and local downloads. Arithmetic arguments receive a separate local-model review scoped to the current step. Atomic adjustments inherit the current unrounded numeric result and its currency. Planning calls have 45-second deadlines inside a three-minute task budget, with one invalid-action repair. The planner cannot guess website URLs, explicit IPs, or missing currency codes and amounts. Missing models and failed planning are visible errors; completed steps are preserved.
- Replies use up to four recent successful rounds, including bounded source evidence for follow-up questions. Failed and stopped rounds are omitted as pairs. Older turns and reference excerpts are reduced first, while the latest user message is preserved in full. The total input is capped at 18,000 characters; when `measureContextUsage()` and `contextWindow` are available, input is also measured with room reserved for an answer. Requests that cannot fit produce an actionable error instead of silently dropping the beginning of the question. Older history remains visible and saved, but is not all sent to the model.
- Reply cloning, context measurement, and generation share a 90-second deadline and a 32,000-character output limit. Stop and deadlines release cloned sessions even when an implementation responds slowly to cancellation. Partial responses remain visible with an explanation when generation fails.

This improves routing, arithmetic, and context reliability; it does not make Nano a larger reasoning model. Generated prose and tool choices still require judgment. The session handling follows [Chrome's Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api).

Unsupported browsers show setup guidance, rather than invented AI replies. Every submitted prompt, including manual tools, requires the local model. Real hardware inference must be tested on an eligible browser; automated tests exercise the API contract with a mock, not a downloaded model.

## A few free tools

**Auto tools is enabled by default.** Nano selects validated calls and consumes their structured results. See [tasks and chaining](tasks.md) for attachments, table operations, file exports, and limits. General writing, coding, and casual chat stay local. Choose **Just chat** to disable tools, or select a tool group to restrict the model's choices. Source cards show provider evidence alongside the model's answer.

| Tool           | Example input                | Public service / limits                                                                                                                                                                                                                           |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculator     | `Calculate (125 + 75) * 15%` | Entirely local. Supports `+ - * / ^`, parentheses, scientific notation, and postfix `%` (divide by 100). No JavaScript execution. Uses floating-point arithmetic, displayed to 15 significant digits; not arbitrary-precision decimal accounting. |
| Date & time    | `What time is it in UTC?`    | Entirely local device clock. Defaults to the browser's time zone; accepts explicit IANA names such as `America/Vancouver`. In manual mode enter `local`, `UTC`, or an IANA name. City names are not guessed.                                      |
| Wikipedia      | `Octopus`                    | MediaWiki search and plaintext extracts, 3 articles. CC BY-SA attribution and article links.                                                                                                                                                      |
| Web search     | `independent search engines` | [Purili](https://puri.li/developer) public web index via `GET /api/search?q=...`; no API key or fixed quota. Up to 10 ranked links and snippets, 300-character queries. Snippets are indexed excerpts, not full page content.                     |
| GitHub         | `react markdown`             | Public repository search. Usually 60 unauthenticated requests/hour and 10 search requests/minute per IP.                                                                                                                                          |
| OpenStreetMap  | `Stanley Park, Vancouver`    | Nominatim, manual searches only, maximum 1 request/second per browser. © OpenStreetMap contributors (ODbL).                                                                                                                                       |
| Weather        | `Vancouver`                  | Open-Meteo and GeoNames, 3-day forecast in °C. CC BY 4.0, non-commercial free tier, 10,000 calls/day.                                                                                                                                             |
| IP lookup      | `1.1.1.1`                    | ipwho.is, explicit address or user-requested public-IP detection. Non-commercial free endpoint, 60 requests/minute; free-tier CORS availability may vary.                                                                                         |
| Exchange rates | `USD`                        | Frankfurter daily reference rates, no key. Not live market or stock prices.                                                                                                                                                                       |

OpenStreetMap place results include an interactive, lazy-loaded map in the conversation, with a marker, pan/zoom controls, attribution, and a place link for opening the full map. Map embeds contact OpenStreetMap separately from the Nominatim search; saved chats retain the coordinates. Older saved results without coordinates continue to show links.

The local **Memory** group exposes `memory.list`, `memory.save`, and `memory.forget`. Facts live in `cheapgpt.memory.v1`, independently of saved conversations. Saving the same case-insensitive name updates its value. Chat mutations require an explicit current user request; saved values must be quoted from that request. The reply builder reads current enabled facts for each response, labels them as untrusted user context, and drops memory if needed to preserve the current request's context budget. Only memory-tool argument generation sees saved facts during planning. Settings provides model-free inspection, editing, deletion, clearing, and a persistent off switch. Storage failures are reported before a successful tool result is produced. See [saved memory](tasks.md#saved-memory) for usage and limits.

Limits and terms can change. Tools do not use a proxy, authentication, autocomplete, tracking, automatic geolocation, or background polling. Provider CORS restrictions, outages, and rate limits are surfaced as failures; no insecure relay is used to bypass them. Requests time out after 15 seconds and successful responses are cached in memory for 5 minutes. Nominatim's limit is per browser: a high-traffic deployment should replace the shared public endpoint with a suitable hosted geocoding provider. Review providers' current terms before commercial use.

In **Just chat**, no prompt or conversation is sent to a server. Calculator and Date & time also stay entirely on-device. Public tools send their query to the selected provider, which also sees your IP. Auto mode sends the lookup query, never the full conversation. Model installation is managed by the browser and can use the network. Production builds use Google Analytics (`G-W6LF4ZBZ4Q`) for site usage; the app does not send prompts, conversations, or tool queries as analytics events. There are no remotely loaded fonts or external image requests from Markdown.

Analytics is disabled in development and on local hosts (`localhost`, `*.localhost`, `127.*`, `0.0.0.0`, and IPv6 loopback), including when serving a production build with `npm run preview`. On those hosts, the Google tag script is never loaded and no analytics events are queued or sent.

Currency conversions such as **“Convert 1 USD to CAD”** are planned by Nano using `currency.convert`. The tool fetches reference rates and calculates the numeric conversion in TypeScript. Nano sees that structured result and writes the final response. Auto and manually selected tools both require local AI. Explicit three-letter codes and amounts must come from the request or successful prior results; missing parameters are not guessed.

### Everyday phrasing

Ask **“What is my timezone?”** or **“Which time zone am I in?”** to see the browser's configured IANA zone and its current UTC offset, including daylight saving time. This reads browser settings locally; it does not verify your physical location. **“What date is it?”** and **“Could you tell me the current time?”** also use the local model.

The calculator accepts **“What is 15% of 80?”**, **“How much is 18 * 7?”**, **“Calculate 1,250 + 75”**, and **“What is 12 × 8?”**. It supports `×` and `÷` as alternatives to `*` and `/`, and well-formed thousands groups such as `1,250.50`. Ambiguous decimal-comma inputs such as `1,25` are rejected.

Polite commands such as **“Can you check the weather in Vancouver?”**, **“Please search GitHub for React chat apps”**, and **“Could you rename this conversation to Weekly planning?”** execute the requested action. General writing, summarization of pasted notes, and coding help remain local model tasks.

### Your public IP

Ask **“What’s my IP address?”** in Auto mode, or select IP lookup and enter “my IP”. CheapGPT requests **https://ipwho.is/** without an address parameter, so the service detects the browser’s public egress IP. Explicit address lookups still use `/ADDRESS`. Current-IP tool requests bypass app/browser caches. The actual response is preserved in the task evidence and supplied to Nano for final drafting; generated prose can still be wrong. No IP request runs on page load. VPNs/proxies can change the public IP, and IP geolocation is approximate. CORS or service failures produce an error, not an invented IP.

## Read a website

Paste a URL or ask **“Read https://example.com/”** / **“Summarize https://example.com/”** in Auto mode, or select **Read website**. The tool fetches HTML/plain text directly, omits credentials and referrer information, extracts up to 8,000 characters, and passes the fetched text to the local model. Reading also requires the local model. No remote scripts, images, or frames are loaded, and links open in a separate tab rather than navigating away from your conversation.

Most websites do not allow browser cross-origin reads (**CORS**). Regional restrictions, sign-in, mixed-content policies, and outages can also prevent access. A readable HTTP error is reported when available; otherwise the browser does not reveal the exact cause. CheapGPT shows an explanation and an original-site link, without generating a summary of missing content or using a proxy to bypass restrictions. JavaScript-rendered pages, authenticated content, PDFs, and other downloads are not supported. Requests time out after 15 seconds, and response bodies are limited to 1 MB. Website integration tests include actual browser CORS enforcement against a second local origin.

## Conversations

History is stored in this browser's `localStorage`, with up to 50 conversations. It supports search, deletion, switching chats, Markdown export, and response copying. **Remember conversations** can disable persistence; **Delete all chats** clears it. Browser storage is not encrypted and clearing site data deletes history. Incomplete streamed responses may survive a reload as partial text. No server storage or account is involved.

### Conversation titles

History starts with the first message as a fallback. Once the local model is ready, a short title is generated after eight idle seconds. Title work uses a small context, is cancelled when you send a message, and times out after a minute. It runs only at completed-round checkpoints 1, 4, and 7; an unchanged topic freezes the title early. Titles stop updating after round 7.

Ask “Rename this conversation to Garden plans” to use the local `rename_conversation` tool. Nano selects `conversation.rename`; the runner permits it only when the user explicitly requested renaming. A rename permanently disables automatic titles for that conversation, including after reloading saved history. No conversation data leaves the device for naming.

## GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) tests and builds pull requests, and deploys successful pushes to **`main`** using the official GitHub Pages artifact and deployment actions. Vite uses relative assets so the SPA works at a repository subpath. Chat navigation uses local state, so no rewrite rules or router fallback are needed.

For a new repository, select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. GitHub's built-in workflow token cannot perform this initial enablement. Check **Settings → Environments → github-pages** if branch restrictions or deployment approval rules are configured. Subsequent pushes to `main` deploy automatically; after changing that setting, rerun any failed initial deployment from the Actions tab.

Default project URL: `https://predatorray.github.io/CheapGPT/`. An existing GitHub Pages account custom domain can redirect this URL. The initial successful deployment reported `http://www.predatorray.me/CheapGPT/`.

**Local AI requires a secure context.** For a custom domain, configure a valid certificate and enable **Enforce HTTPS** in GitHub Pages settings. HTTP visitors get an explicit warning and an HTTPS link in local AI setup; public tools remain usable. Check that the HTTPS variant works before enabling local AI. The deployment action verifies publishing; it does not verify the custom domain's certificate or DNS.
