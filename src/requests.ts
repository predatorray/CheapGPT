// Normalize only the command wrapper; never rewrite quoted text or the full model prompt.
export function requestText(input: string) {
  return input
    .trim()
    .replace(/’/g, "'")
    .replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i, '')
    .replace(/\s+please[?!.]*$/i, '')
    .replace(/[?!]+$/, '')
    .trim();
}
