# Tasks and tool chaining

[← CheapGPT](../README.md)

Every submitted prompt requires the browser's local LanguageModel. In Auto tools mode Nano selects the next tool, generates its arguments, observes the result, and continues. It also writes the final answer. There are no phrase-matching task recipes or model-free replies. **Just chat** goes directly to local model drafting without tools or attachment access. Selecting a tool group restricts the planner's choices.

Purely social greetings, thanks and acknowledgments use one lightweight local-model decision, then go directly to a streamed local-model reply without task history or tool planning. A greeting followed by an information/action request continues through the task harness; manual tool selections and pending clarifications keep their existing flow.

Try requests such as:

- `Convert 250 USD to CAD, add 12% tax, split between 3 people and export as CSV.`
- `What is my timezone?`
- `Search the web for independent search engines and export the results as JSON`
- `Compare GitHub repositories vitejs/vite and facebook/react`
- Attach a CSV, then `Sum Amount by Team and export the totals as CSV`
- `Add 7 days to 2026-10-30`
- `Create calendar event "Team planning" from 2026-10-30T09:00:00-07:00 to 2026-10-30T10:00:00-07:00`

These are examples, not guaranteed workflows. Nano can make planning and arithmetic-translation mistakes. Expand Task progress to inspect actual executed steps and the number of local planning calls. Calculations run in code; the model supplies the formula. Public lookups require network access.

`web.search` queries Purili's public index and returns `query` and `results` with `title`, `url`, and `description`. Select **Web search** for a keyword lookup, or use Auto tools to combine search with other tools. A later `website.read` call can use a result URL such as `r1.results.0.url`; browser CORS restrictions still apply when reading the page. Results can also be exported directly. Search uses the existing public-network guards, request cancellation, 15-second timeout, and five-minute cache. Search snippets are untrusted source material, not instructions or proof of the full page's contents.

## Attachments and downloads

Use the paperclip to attach up to four `.txt`, `.md`, `.markdown`, `.json`, or `.csv` files. Each file is limited to 1 MB; a chat is limited to 2 MB of attachment text. CSV files support up to 2,000 data rows, 50 unique nonempty column headers, and quoted cells. A dot is required for decimal numeric cells. PDFs, images, spreadsheets, and binary files are not supported by this attachment reader.

Attachments stay in memory, scoped to the current chat. Reattach them after reloading. **Tool outputs, excerpts, computed tables, and generated file contents are saved with the conversation when Remember conversations is on.** Those saved results can support follow-up exports after a reload. No server stores them.

Document search ranks overlapping text passages by matching words. It is not an embedding model or an exhaustive document review. Answers use a bounded selection of passages. Field extraction returns literal excerpts or null for missing values. Unsupported model values receive one evidence-based local-model repair, with verified fields frozen; persistent unsupported values fail visibly. Copied source text is not independent fact verification.

`file.export_current` exports the latest completed data result automatically, skipping download receipts. Use it for the final table, calculation or extracted fields. `file.export_results` exports specific older or multiple completed results by ID without asking Nano to retype their values. A single selected table keeps its original rows and columns. Multiple results and nested objects use Result/Tool/Field/Value rows with full field paths, preserving nested values rather than dropping them. Nano is instructed to select the final relevant result for a final report, rather than intermediate stages or earlier download metadata. `file.create` supports new content and custom layouts. File previews and expandable executed arguments make these outputs inspectable.

Downloads are prepared locally as Markdown, CSV, JSON, or ICS, up to 256 KB each. Click the download button to save a file; the model cannot silently write files to disk. New file content uses a format-specific argument schema: calendar events require title/start/end, CSV requires columns and rows, Markdown requires text, and custom JSON uses serialized JSON text. CSV export prefixes potentially executable spreadsheet formulas in string cells. Calendar exports use explicit UTC instants and escaped, folded ICS fields.

## Runner

The runner executes at most **six tool calls per turn**, with a **three-minute task deadline**, a **45-second deadline for each model decision**, one repair of an invalid action, and duplicate-call detection. Failed calls count toward the tool-call limit. Completed results remain visible when another step fails, the deadline expires, or the user presses Stop. Follow-up turns get their own budget.

When successful prior tasks exist, Nano first resolves the conversational intent: a new request, reuse of an earlier result, or replay of an earlier procedure. For a replay, Nano selects a saved procedure and proposes explicit text edits for changed inputs, removed operations or newly appended steps. Edits must match unique source text and must not overlap; code applies them without regenerating unchanged steps. The result is a standalone request with the latest inputs and retained earlier operations. New numeric inputs must survive resolution. The original message and resolved request are both saved and inspectable. Subsequent revisions use the resolved procedure, rather than trying to reconstruct it from answer prose. Replays start fresh result IDs and omit old computed values; exports or other operations on existing answers can still use historical results.

Nano checks file intent separately from selecting relevant tool groups and deciding whether the message depends on earlier conversation. Within file-producing tasks, a focused local-model decision distinguishes reading existing data, transforming it, and writing a new output; a filename alone does not mean a download was requested. File tools are offered only for a file request or when the user selects the export group. Self-contained requests omit old conversation and results during planning and final drafting. If no tool work succeeds, a failure is displayed directly rather than drafted from stale results.

Nano decomposes the request into ordered operations, including any export. A source alignment check requires the original words and inputs in order, tolerates inserted explanatory words, and copies the corresponding original text spans for execution. This preserves source text without demanding perfect verbatim quotes. Omitted or reordered inputs trigger one local-model repair. Nano selects concrete tools from the relevant installed capabilities while observing completed input types and values. There is no separate per-clause group classifier. An atomic arithmetic clause uses exactly one calculator tool. Clauses requesting final prose, summaries, comparisons or response formatting are retained as response instructions and are fulfilled during final drafting, without another lookup. These are model-generated plans; there are no prompt-specific task recipes. Scope decisions, clauses, tool bindings and executed arguments are inspectable in Task progress.

Arithmetic arguments receive a separate local-model review scoped to the current step. Formula prompts show only actual completed numeric references; before any result exists they explicitly require literal inputs, with no example result IDs. Stateful arithmetic prompts contain only that step and the operation definitions, so unrelated amounts and operations do not distract the model. Operands are constrained to numeric inputs stated in that planned step, with the original request as a fallback when the step omits digits.

`calculator.adjust` applies one operation to the current numeric result from the most recent successful conversion or calculation. It inherits the unrounded value and currency automatically. Nano supplies only operation, operand, and label:

```json
{ "operation": "add_percent", "operand": 12, "label": "Total including tax" }
```

The next adjustment can divide that result without retyping its value:

```json
{ "operation": "divide", "operand": 3, "label": "Per person including tax" }
```

Use `calculator.evaluate` for standalone formulas or branches using an earlier result. Referenced monetary values carry their currency into the result; Nano does not need to retype the currency code. Currency conversions expose `value` and `currency` alongside the original `convertedAmount` field. `file.export_current` serializes the latest result exactly; `file.export_results` handles selected older/multiple results. Completed data stays in the reusable workspace across repeated downloads; file receipts do not displace it. Current input bindings and output values are visible in Task progress.

Every call is checked against its tool's argument schema. The runner resolves `$ref` values from successful structured outputs; it does not parse rendered prose to recover numbers. Current-turn results are `r1`, `r2`, etc. Up to four earlier successful results in the same chat are exposed as `p1`, `p2`, etc. Tool contracts explicitly mark data inputs that accept references. Field names, labels, file formats, column choices and other configuration values stay literal. Reference paths are enumerated only from successful results and checked against the input type; exact shorthand paths are normalized for declared data inputs. Privacy guards inspect normalized references, so shorthand cannot bypass local-data protections. Calculator expressions support numeric `$r1.field` placeholders (also accepting the unambiguous `r1.field` spelling), resolved and validated before the arithmetic parser runs. A pending clarification retains its original goal for the next model decision.

Planning context is bounded and measured when the browser exposes context usage. Tool descriptions, older conversation excerpts, and result previews can be reduced while the current goal is kept intact. Final drafting uses bounded evidence with the existing response limits and the remaining task deadline.

## Tools

| Tool                                                                                 | Structured output                                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `currency.convert`                                                                   | Amount, currency codes, numeric converted amount, rate, and date                                          |
| `currency.rates`                                                                     | Base code, rate date, rates                                                                               |
| `calculator.adjust`                                                                  | One operation on the current numeric result, with inherited currency and an explicit input-result binding |
| `calculator.evaluate`                                                                | Numeric value, formatted result, expression; rounded value when a currency is supplied                    |
| `github.search`                                                                      | Repository names, URLs, descriptions, stars, and languages                                                |
| `github.read_file`                                                                   | Public text file, repository, path, and truncation flag                                                   |
| `wikipedia.search`, `places.search`, `weather.forecast`, `ip.lookup`, `website.read` | Provider facts plus source cards and structured fields                                                    |
| `datetime.now`                                                                       | Device instant and browser timezone                                                                       |
| `documents.read`, `documents.search`, `documents.extract`                            | Bounded document text, matched passages, tables, or evidence-backed fields                                |
| `table.query`                                                                        | Filtered, aggregated, sorted, selected table and row count                                                |
| `date.calculate`, `date.convert`                                                     | ISO instant or date and formatted timezone result                                                         |
| `file.export_current`                                                                | Exact CSV/JSON export of the latest completed data result, skipping file receipts                         |
| `file.export_results`                                                                | CSV/JSON serialization of selected successful results, preserving exact values                            |
| `file.create`                                                                        | Prepared file metadata and downloadable content                                                           |

`table.query` takes one model-selected `source`: an attached CSV ID or a successful table-result path such as `r1.table`. Its native argument schema enumerates available sources and column names. The older documentId/table inputs remain supported for stored calls. It applies filter → aggregate → sort → select → limit. Filters support equality, inequality, substring matching, and numeric comparisons. Aggregations support sum, average, count, minimum, and maximum, with an optional grouping column. Numeric operations reject missing or nonnumeric cells rather than treating them as zero.

Date arithmetic adds elapsed days, hours, or minutes. A day is 24 hours, not a business day or a promise of the same local wall time across daylight-saving transitions. Date-time inputs require an explicit UTC offset; ambiguous local times are not guessed. Currency calculations use reference rates and floating-point arithmetic; displayed shares are rounded, which can leave a minor-unit remainder when splitting a total.

## Boundaries and verification

Tools can read public endpoints and prepare local outputs; they cannot execute arbitrary JavaScript, send messages, change repository files, or change repository files. The model can invoke `conversation.rename` only when the user explicitly requested a title change. `capabilities.list` supplies the installed capability list through the same model-directed loop.

Network tools cannot receive references derived from local document/utility results. When files are attached, public lookup arguments must come from the explicit request or earlier public results. Website URLs and repository names must be supplied by the user or earlier public results; IP lookups require an explicit address or own-IP request. Retrieved text remains untrusted reference data.

Provider quotas and CORS restrictions still apply. The public-site reader is not a full browser, and there is no general web-search provider, backend proxy, or browser extension in this implementation. Model-selected actions can still be wrong. Automated tests use mocked native model decisions and fixed provider responses; real Nano quality and latency require eligible hardware testing.
