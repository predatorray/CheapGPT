# Tasks and tool chaining

[← CheapGPT](../README.md)

Every submitted prompt requires the browser's local LanguageModel. In Auto tools mode Nano selects the next tool, generates its arguments, observes the result, and continues. It also writes the final answer. There are no phrase-matching task recipes or model-free replies. **Just chat** goes directly to local model drafting without tools or attachment access. Selecting a tool group restricts the planner's choices.

Try requests such as:

- `Convert 250 USD to CAD, add 12% tax, split between 3 people and export as CSV.`
- `What is my timezone?`
- `Compare GitHub repositories vitejs/vite and facebook/react`
- Attach a CSV, then `Sum Amount by Team and export the totals as CSV`
- `Add 7 days to 2026-10-30`
- `Create calendar event "Team planning" from 2026-10-30T09:00:00-07:00 to 2026-10-30T10:00:00-07:00`

These are examples, not guaranteed workflows. Nano can make planning and arithmetic-translation mistakes. Expand Task progress to inspect actual executed steps and the number of local planning calls. Calculations run in code; the model supplies the formula. Public lookups require network access.

## Attachments and downloads

Use the paperclip to attach up to four `.txt`, `.md`, `.markdown`, `.json`, or `.csv` files. Each file is limited to 1 MB; a chat is limited to 2 MB of attachment text. CSV files support up to 2,000 data rows, 50 unique nonempty column headers, and quoted cells. A dot is required for decimal numeric cells. PDFs, images, spreadsheets, and binary files are not supported by this attachment reader.

Attachments stay in memory, scoped to the current chat. Reattach them after reloading. **Tool outputs, excerpts, computed tables, and generated file contents are saved with the conversation when Remember conversations is on.** Those saved results can support follow-up exports after a reload. No server stores them.

Document search ranks overlapping text passages by matching words. It is not an embedding model or an exhaustive document review. Answers use a bounded selection of passages. Field extraction returns literal excerpts or null for missing values; copied source text is not independent fact verification.

`file.export_results` exports selected completed results by ID without asking Nano to retype their values. A single table keeps its original rows and columns; scalar results use Result/Tool/Field/Value columns. `file.create` supports new content and custom layouts. File previews and expandable executed arguments make these outputs inspectable.

Downloads are prepared locally as Markdown, CSV, JSON, or ICS, up to 256 KB each. Click the download button to save a file; the model cannot silently write files to disk. CSV export prefixes potentially executable spreadsheet formulas in string cells. Calendar exports use explicit UTC instants and escaped, folded ICS fields.

## Runner

The runner executes at most **six tool calls per turn**, with a **three-minute task deadline**, a **45-second deadline for each model decision**, one repair of an invalid action, and duplicate-call detection. Failed calls count toward the tool-call limit. Completed results remain visible when another step fails, the deadline expires, or the user presses Stop. Follow-up turns get their own budget.

Nano checks file intent separately from selecting relevant tool groups and deciding whether the message depends on earlier conversation. File tools are offered only for a file request or when the user selects the export group. Self-contained requests omit old conversation and results during planning and final drafting. If no tool work succeeds, a failure is displayed directly rather than drafted from stale results.

Nano decomposes the request into an ordered list of clauses, including any export. A coverage check verifies that the clauses preserve the original words, numbers and units; one local-model repair is allowed when formatting changes or omits text. Nano selects a capability group for each clause, then binds a minimal tool sequence within that group and generates its arguments after observing earlier results. These are model-generated plans; there are no prompt-specific task recipes. Scope decisions, clauses, tool bindings and executed arguments are inspectable in Task progress.

Arithmetic arguments receive a separate local-model review scoped to the current step. Stateful arithmetic prompts contain only that step and the operation definitions, so unrelated amounts and operations do not distract the model. Operands are constrained to numeric inputs stated in that planned step, with the original request as a fallback when the step omits digits.

`calculator.adjust` applies one operation to the current numeric result from the most recent successful conversion or calculation. It inherits the unrounded value and currency automatically. Nano supplies only operation, operand, and label:

```json
{ "operation": "add_percent", "operand": 12, "label": "Total including tax" }
```

The next adjustment can divide that result without retyping its value:

```json
{ "operation": "divide", "operand": 3, "label": "Per person including tax" }
```

Use `calculator.evaluate` for standalone formulas or branches using an earlier result. Referenced monetary values carry their currency into the result; Nano does not need to retype the currency code. Currency conversions expose `value` and `currency` alongside the original `convertedAmount` field. `file.export_results` serializes the selected results exactly. Current input bindings and output values are visible in Task progress.

Every call is checked against its tool's argument schema. The runner resolves `$ref` values from successful structured outputs; it does not parse rendered prose to recover numbers. Current-turn results are `r1`, `r2`, etc. Up to four earlier successful results in the same chat are exposed as `p1`, `p2`, etc. The argument schema permits reference values only after successful results exist; reference paths are enumerated from those results. Calculator expressions support numeric `$r1.field` placeholders, resolved and validated before the arithmetic parser runs. A pending clarification retains its original goal for the next model decision.

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
| `file.export_results`                                                                | CSV/JSON serialization of selected successful results, preserving exact values                            |
| `file.create`                                                                        | Prepared file metadata and downloadable content                                                           |

`table.query` applies filter → aggregate → sort → select → limit. Filters support equality, inequality, substring matching, and numeric comparisons. Aggregations support sum, average, count, minimum, and maximum, with an optional grouping column. Numeric operations reject missing or nonnumeric cells rather than treating them as zero.

Date arithmetic adds elapsed days, hours, or minutes. A day is 24 hours, not a business day or a promise of the same local wall time across daylight-saving transitions. Date-time inputs require an explicit UTC offset; ambiguous local times are not guessed. Currency calculations use reference rates and floating-point arithmetic; displayed shares are rounded, which can leave a minor-unit remainder when splitting a total.

## Boundaries and verification

Tools can read public endpoints and prepare local outputs; they cannot execute arbitrary JavaScript, send messages, change repository files, or change repository files. The model can invoke `conversation.rename` only when the user explicitly requested a title change. `capabilities.list` supplies the installed capability list through the same model-directed loop.

Network tools cannot receive references derived from local document/utility results. When files are attached, public lookup arguments must come from the explicit request or earlier public results. Website URLs and repository names must be supplied by the user or earlier public results; IP lookups require an explicit address or own-IP request. Retrieved text remains untrusted reference data.

Provider quotas and CORS restrictions still apply. The public-site reader is not a full browser, and there is no general web-search provider, backend proxy, or browser extension in this implementation. Model-selected actions can still be wrong. Automated tests use mocked native model decisions and fixed provider responses; real Nano quality and latency require eligible hardware testing.
