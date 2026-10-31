// Align model-selected operations to the source instead of executing paraphrases.
// Inserted explanatory words are harmless; omitted/reordered source inputs are not.
export function sourceInstructions(goal: string, purposes: string[]): string[] {
  if (!purposes.length) return [];
  const tokenize = (text: string) => [...text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?|[\p{L}_]+/gu)];
  const source = tokenize(goal).filter(
    (token) => !['and', 'then', 'also'].includes(token[0].toLowerCase()),
  );
  const proposed = purposes.flatMap((purpose, step) =>
    tokenize(purpose).map((token) => ({ word: token[0].toLowerCase(), step })),
  );
  const ends = purposes.map(() => -1);
  let cursor = 0;
  for (const token of source) {
    const position = proposed.findIndex(
      (candidate, index) => index >= cursor && candidate.word === token[0].toLowerCase(),
    );
    if (position < 0)
      throw new Error(
        `The decomposition omitted or changed ${JSON.stringify(goal.slice(token.index))}.`,
      );
    let end = token.index! + token[0].length;
    while (end < goal.length && !/\s/.test(goal[end])) end++;
    ends[proposed[position].step] = end;
    cursor = position + 1;
  }
  if (ends.some((end) => end < 0))
    throw new Error('The decomposition added an operation without matching source text.');
  // Every original character belongs to one operation, including punctuation and
  // connectors. Only the model chooses operation boundaries, never prompt rules.
  ends[ends.length - 1] = goal.length;
  let start = 0;
  return ends.map((end) => {
    if (end <= start) throw new Error('Operation boundaries must not split the same source token.');
    const text = goal.slice(start, end).trim();
    start = end;
    return text;
  });
}

export function applyReplayEdits(
  procedure: string,
  patches: { before: string; after: string }[],
  append: string,
): string {
  // Locate all edits against the original procedure to prevent cascading replacements.
  const edits = patches
    .map((edit) => {
      const start = procedure.indexOf(edit.before);
      if (!edit.before || start < 0 || procedure.indexOf(edit.before, start + 1) >= 0)
        throw new Error('A replay edit must identify unique text in the saved procedure.');
      return { ...edit, start, end: start + edit.before.length };
    })
    .sort((a, b) => a.start - b.start);
  if (edits.some((edit, i) => i > 0 && edit.start < edits[i - 1].end))
    throw new Error('Replay edits must not overlap.');
  let request = procedure;
  for (const edit of edits.reverse())
    request = request.slice(0, edit.start) + edit.after + request.slice(edit.end);
  return (request + (append ? ' ' + append : '')).trim();
}
