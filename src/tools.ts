import type { ToolId, ToolResult } from './types';
import { calculateCurrencyConversion, extractCurrencyConversion } from './currency';

export const toolInfo: {
  id: ToolId;
  name: string;
  description: string;
  placeholder: string;
  provider: string;
  url: string;
  quota: string;
}[] = [
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    description: 'Borrow a little knowledge',
    placeholder: 'A topic, e.g. the octopus',
    provider: 'Wikimedia',
    url: 'https://www.mediawiki.org/wiki/API:Main_page',
    quota: 'Public API; be considerate. Article text is CC BY-SA.',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Find someone else’s code',
    placeholder: 'Repository search, e.g. react markdown',
    provider: 'GitHub',
    url: 'https://docs.github.com/en/rest/search',
    quota: 'Unauthenticated: usually 60 requests/hour, search 10/minute per IP.',
  },
  {
    id: 'places',
    name: 'OpenStreetMap',
    description: 'Look vaguely in the right direction',
    placeholder: 'A place, e.g. Stanley Park, Vancouver',
    provider: 'Nominatim / © OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    quota: 'At most 1 request/second; cached, user-triggered searches only.',
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Outsource looking out the window',
    placeholder: 'A city, e.g. Vancouver',
    provider: 'Open-Meteo / GeoNames',
    url: 'https://open-meteo.com/',
    quota: 'Free non-commercial tier: 10,000 calls/day; data CC BY 4.0.',
  },
  {
    id: 'ip',
    name: 'IP lookup',
    description: 'An address. A very rough location.',
    placeholder: 'An IP address, e.g. 1.1.1.1',
    provider: 'ipwho.is',
    url: 'https://ipwhois.io/documentation',
    quota: 'Free non-commercial endpoint: 60 requests/minute. Browser CORS availability may vary.',
  },
  {
    id: 'currency',
    name: 'Exchange rates',
    description: 'Convert your hypothetical savings',
    placeholder: 'Convert 1 USD to CAD, or enter a base currency such as USD',
    provider: 'Frankfurter / institutional reference rates',
    url: 'https://frankfurter.dev/',
    quota: 'No API key; daily reference rates, not live trading prices.',
  },
];

const cache = new Map<string, { time: number; data: unknown }>();
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < 300_000) return cached.data as T;
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    referrerPolicy: 'strict-origin-when-cross-origin',
  });
  if (!response.ok)
    throw new Error(
      response.status === 429 || response.status === 403
        ? 'This public API has hit a limit. Give it a breather and try again later.'
        : `The public API returned HTTP ${response.status}.`,
    );
  const data: unknown = await response.json();
  if (cache.size > 100) cache.clear();
  cache.set(url, { time: Date.now(), data });
  return data as T;
}
const url = (base: string, params: Record<string, string>) =>
  `${base}?${new URLSearchParams(params)}`;
let lastPlaceRequest = 0;
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export async function runTool(
  tool: ToolId,
  input: string,
  signal: AbortSignal,
): Promise<ToolResult> {
  const query = input.trim().slice(0, 300);
  if (!query) throw new Error('Give this tool something to look up first.');
  signal.throwIfAborted();
  if (tool === 'wikipedia') {
    const data = await json<{
      query?: {
        pages?: Record<
          string,
          { title: string; extract?: string; fullurl: string; index?: number }
        >;
      };
    }>(
      url('https://en.wikipedia.org/w/api.php', {
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: '3',
        prop: 'extracts|info',
        exintro: '1',
        explaintext: '1',
        exsentences: '4',
        inprop: 'url',
        format: 'json',
        origin: '*',
      }),
      signal,
    );
    const sources = Object.values(data.query?.pages || {})
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((p) => ({
        title: p.title,
        url: p.fullurl,
        detail: p.extract?.slice(0, 1600) || 'No summary available.',
      }));
    return {
      tool,
      summary: sources.length
        ? `Found ${sources.length} articles. Someone already did the homework.`
        : 'No encyclopedia articles found. Try a different topic.',
      sources,
    };
  }
  if (tool === 'github') {
    const data = await json<{
      items: {
        full_name: string;
        html_url: string;
        description: string | null;
        stargazers_count: number;
        language: string | null;
      }[];
    }>(
      url('https://api.github.com/search/repositories', { q: query, sort: 'stars', per_page: '4' }),
      signal,
    );
    return {
      tool,
      summary: data.items.length
        ? 'Public repositories, sorted by stars. Popularity is our entire due diligence.'
        : 'No repositories found. Try a broader search.',
      sources: data.items.map((r) => ({
        title: r.full_name,
        url: r.html_url,
        detail: `${r.description || 'No description'} · ${r.stargazers_count.toLocaleString()} stars · ${r.language || 'Various languages'}`,
      })),
    };
  }
  if (tool === 'places') {
    const endpoint = url('https://nominatim.openstreetmap.org/search', {
      q: query,
      format: 'jsonv2',
      limit: '3',
    });
    const cached = cache.get(endpoint);
    if (!cached || Date.now() - cached.time >= 300_000) {
      if (Date.now() - lastPlaceRequest < 1100)
        throw new Error('OpenStreetMap asks for a pause between searches. Try again in a second.');
      lastPlaceRequest = Date.now();
    }
    const data = await json<{ display_name: string; lat: string; lon: string; type: string }[]>(
      endpoint,
      signal,
    );
    return {
      tool,
      summary: data.length
        ? 'Places found. Navigation skills sold separately. Data © OpenStreetMap contributors.'
        : 'No places found. Add a city or country to your search.',
      sources: data.map((p) => ({
        title: p.display_name,
        location: { latitude: Number(p.lat), longitude: Number(p.lon) },
        url: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(p.lat)}&mlon=${encodeURIComponent(p.lon)}#map=14/${encodeURIComponent(p.lat)}/${encodeURIComponent(p.lon)}`,
        detail: `${p.type} · ${p.lat}, ${p.lon} · © OpenStreetMap contributors`,
      })),
    };
  }
  if (tool === 'weather') {
    const geo = await json<{
      results?: { name: string; country: string; latitude: number; longitude: number }[];
    }>(
      url('https://geocoding-api.open-meteo.com/v1/search', {
        name: query,
        count: '1',
        language: 'en',
        format: 'json',
      }),
      signal,
    );
    const place = geo.results?.[0];
    if (!place) throw new Error('City not found. Try a city name such as Vancouver or Tokyo.');
    const data = await json<{
      current: { temperature_2m: number; apparent_temperature: number; wind_speed_10m: number };
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    }>(
      url('https://api.open-meteo.com/v1/forecast', {
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: 'temperature_2m,apparent_temperature,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: '3',
      }),
      signal,
    );
    const detail =
      `Now: ${data.current.temperature_2m}°C, feels like ${data.current.apparent_temperature}°C; wind ${data.current.wind_speed_10m} km/h.\n` +
      data.daily.time
        .map(
          (day, i) =>
            `${day}: ${data.daily.temperature_2m_min[i]}–${data.daily.temperature_2m_max[i]}°C; rain chance ${data.daily.precipitation_probability_max[i] ?? 'unknown'}%.`,
        )
        .join('\n');
    return {
      tool,
      summary: `Weather in ${place.name}, ${place.country}. A forecast, not a promise.`,
      sources: [
        {
          title: `${place.name} · 3-day forecast`,
          url: `https://open-meteo.com/en/docs#latitude=${place.latitude}&longitude=${place.longitude}`,
          detail: detail + '\nSource: Open-Meteo (CC BY 4.0); geocoding: GeoNames.',
        },
      ],
    };
  }
  if (tool === 'ip') {
    // Explicit addresses only: never silently disclose a visitor's own IP to a lookup service.
    const v4 =
      /^(\d{1,3}\.){3}\d{1,3}$/.test(query) && query.split('.').every((n) => Number(n) <= 255);
    const v6 = query.includes(':') && /^[0-9a-f:]+$/i.test(query) && query.length <= 39;
    if (!v4 && !v6)
      throw new Error(
        'Enter an explicit IPv4 or IPv6 address. We never look up your own IP automatically.',
      );
    const data = await json<{
      success: boolean;
      message?: string;
      ip: string;
      city: string;
      region: string;
      country: string;
      connection?: { isp: string };
      timezone?: { id: string };
    }>(`https://ipwho.is/${encodeURIComponent(query)}`, signal);
    if (!data.success) throw new Error(data.message || 'This address could not be looked up.');
    return {
      tool,
      summary: 'Approximate IP location. This is not a street address.',
      sources: [
        {
          title: data.ip,
          url: 'https://ipwhois.io/',
          detail: `${data.city}, ${data.region}, ${data.country} · ISP: ${data.connection?.isp || 'Unknown'} · Time zone: ${data.timezone?.id || 'Unknown'}`,
        },
      ],
    };
  }
  const conversion = extractCurrencyConversion(query);
  if (!conversion && !/^[a-z]{3}$/i.test(query))
    throw new Error(
      'Enter a three-letter base currency, or a conversion such as “Convert 1 USD to CAD”.',
    );
  const data = await json<{ base: string; date: string; rates: Record<string, number> }>(
    url('https://api.frankfurter.dev/v1/latest', { base: conversion?.from || query.toUpperCase() }),
    signal,
  );
  if (conversion) {
    if (data.base !== conversion.from)
      throw new Error('The rate provider returned a different base currency. Please try again.');
    const rate = conversion.from === conversion.to ? 1 : data.rates?.[conversion.to];
    const answer = calculateCurrencyConversion(conversion, rate);
    return {
      tool,
      summary: `${answer}. Reference rates for ${data.date}.`,
      sources: [
        {
          title: answer,
          url: 'https://frankfurter.dev/',
          detail: `Calculated locally: ${conversion.amount} × ${rate} = ${conversion.amount * rate} ${conversion.to}.\nRate: 1 ${conversion.from} = ${rate} ${conversion.to}. As of ${data.date}.\nFrankfurter daily reference rates; rounded to the target currency’s standard minor units. Bank fees and spreads are excluded.`,
        },
      ],
    };
  }
  return {
    tool,
    summary: `Reference exchange rates for ${data.date}. Your imaginary fortune, in several currencies.`,
    sources: [
      {
        title: `1 ${data.base} buys…`,
        url: 'https://frankfurter.dev/',
        detail:
          Object.entries(data.rates)
            .filter(([code]) =>
              ['USD', 'EUR', 'GBP', 'CAD', 'JPY', 'AUD', 'CHF', 'CNY'].includes(code),
            )
            .map(([code, rate]) => `${rate} ${code}`)
            .join(' · ') + '\nDaily reference rates; not real-time financial advice.',
      },
    ],
  };
}
