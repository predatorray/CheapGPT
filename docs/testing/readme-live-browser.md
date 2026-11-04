# README live browser verification — incomplete

Tested against localhost:5173 in the user's Chrome with its real LanguageModel.
No native model or provider fixtures were injected into these live checks.

| Example | Observed result |
| --- | --- |
| Invoice draft | Passed after prose-routing and schema-input changes. |
| Pasted meeting notes | Passed using Maya/Friday/pilot sample notes. |
| 15% of 80 | Passed: 12. |
| Browser timezone | Passed: browser zone and offset returned by datetime.now. |
| Vancouver weather | Passed with live Open-Meteo results. |
| GitHub React chat apps | Passed after removing implicit github_file scope expansion. |
| Conversion, tax, split, CSV | FAIL: latest attempt converted 250 USD but omitted remaining operations and download. Earlier attempts chose rates instead of conversion, invented arithmetic inputs, or duplicated operations. |
| Attached notes extraction | BLOCKED: extension requires Allow access to file URLs. Generated notes.txt fixture available in /tmp/cheapgpt-readme-live. |
| Attached CSV sort | BLOCKED by same setting. expenses.csv fixture in same directory. |
| Convert 100 USD to CAD | Passed: 139.75 CAD using live November 3 reference rate. |
| Summarize example.com | FAIL: model chose web.search instead of website.read; no summary produced. Other attempts timed out during planning. Direct reading remains subject to CORS. |
| Rename conversation | INCONCLUSIVE: heading became Weekly planning, but latest attempt had no successful rename tool receipt; automatic title generation can produce the same heading. |
| JavaScript word frequencies | FAIL: one attempt generated invalid code; another answered with code without executing it. Bounded execution-error repair now has regression coverage. |
| Remember Celsius preference | FAIL: final attempt promised to remember it without a memory.save tool receipt. |

Current automated verification: 250 unit tests pass; 14 mocked README integration
checks pass using the installed Chrome executable; production build passes.
These results do not establish live inference quality. Live acceptance remains
incomplete, and no all-prompts-pass claim is warranted.

## Changes under review

- Explicit model decision for prose requests before tool planning.
- Exclude response-constraint schema text from planner input while retaining constrained decoding.
- Source-index boundaries for repairing decompositions without copying/inventing source text.
- One tool binding per atomic action except document operations needing a read prerequisite.
- Keep GitHub search and file-reading scopes separate unless selected by the model.
- Clarify tool input contracts and allow one bounded repair of generated JavaScript execution errors.

Remaining root problems include semantic completeness of decomposition and unreliable
routing of explicit state changes and code execution. No prompt-specific bypasses
were added. Browser-generated test chats remain in local history.
