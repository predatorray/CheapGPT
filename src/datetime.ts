import { requestText } from './requests';

export function dateTimeQuery(input: string): string | null {
  const text = requestText(input).replace(/[.]+$/, '');
  if (
    /^(?:(?:what(?:'s| is)|tell me|show me) (?:my|the browser's|my browser's|the current) time\s?zone|(?:what|which) time\s?zone am i in|my time\s?zone|time\s?zone)$/i.test(
      text,
    )
  )
    return 'timezone';
  const match = text.match(
    /^(?:(?:what(?:'s| is) (?:the )?(?:current )?(?:date|time)(?: (?:is it|today|now))?|what (?:time|date) is it(?: now| today)?|what day is it(?: today)?|what(?:'s| is) today's date|today's date|(?:tell me |show me )?(?:the )?current (?:date|time)|time now))(?: in ([a-z_+-]+(?:\/[a-z_+-]+)+|UTC))?$/i,
  );
  return match ? match[1] || 'local' : null;
}

export function dateTimeSummary(input: string, now = new Date()) {
  const query = dateTimeQuery(input) ?? input.trim();
  if (query.toLowerCase() === 'timezone') {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace(/^GMT/, 'UTC');
    return `Your browser's time zone is **${zone}**. Current UTC offset: **${offset || 'unavailable'}**.\n\nReported by your browser settings; this is not a verified physical location. The offset can change with daylight saving time.`;
  }
  const timeZone = /^(?:local|now|today)$/i.test(query)
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : query;
  try {
    const value = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone,
    }).format(now);
    return `**${value}** (${timeZone}).\n\nFrom your device clock. For another zone, use an IANA name such as America/Vancouver or UTC.`;
  } catch {
    throw new Error(
      'Use “local”, “UTC”, or an IANA time zone such as America/Vancouver. City names are not guessed.',
    );
  }
}
