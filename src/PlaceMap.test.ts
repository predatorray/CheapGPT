import { describe, expect, it } from 'vitest';
import { placeMapUrl } from './PlaceMap';

describe('OpenStreetMap embeds', () => {
  it('centers a fixed-provider map on the result and includes its marker', () => {
    const url = new URL(placeMapUrl({ latitude: 49.3, longitude: -123.14 })!);
    expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/export/embed.html');
    expect(url.searchParams.get('marker')).toBe('49.3,-123.14');
    const bounds = url.searchParams.get('bbox')!.split(',').map(Number);
    expect(bounds[0]).toBeLessThan(-123.14);
    expect(bounds[2]).toBeGreaterThan(-123.14);
    expect(bounds[1]).toBeLessThan(49.3);
    expect(bounds[3]).toBeGreaterThan(49.3);
  });
  it('omits maps for old results or invalid coordinates', () => {
    for (const location of [
      undefined,
      { latitude: NaN, longitude: 0 },
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
    ]) {
      expect(placeMapUrl(location)).toBeUndefined();
    }
  });
  it('keeps bounds valid at the edges of the world', () => {
    const url = new URL(placeMapUrl({ latitude: 90, longitude: -180 })!);
    expect(url.searchParams.get('bbox')!.split(',').map(Number)).toEqual([
      -180, 89.99, -179.985, 90,
    ]);
  });
});
