import type { Source } from './types';

// Build the embed ourselves: saved conversations and API responses never supply iframe URLs.
export function placeMapUrl(location: Source['location']): string | undefined {
  if (!location) return undefined;
  const { latitude, longitude } = location;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return undefined;
  const bbox = [
    Math.max(-180, longitude - 0.015),
    Math.max(-90, latitude - 0.01),
    Math.min(180, longitude + 0.015),
    Math.min(90, latitude + 0.01),
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  })}`;
}

export function PlaceMap({ location, title }: { location: Source['location']; title: string }) {
  const src = placeMapUrl(location);
  if (!src) return null;
  return (
    <div className="place-map">
      <iframe
        src={src}
        title={`OpenStreetMap map of ${title}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <p>
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap contributors
        </a>{' '}
        · Pan and zoom to explore. If the map is unavailable, use the place link above.
      </p>
    </div>
  );
}
