export const CURRENT_IP_QUERY = 'current';

export function isCurrentIpRequest(input: string): boolean {
  return /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:(?:what(?:'s| is)|show(?: me)?|tell me|find|look up|get|check)\s+)?my\s+(?:(?:public|external|current)\s+)?ip(?:\s+address)?(?:\s+please)?[?.!]*$/i.test(input.trim().replace(/’/g, "'"));
}
