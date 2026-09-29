import { describe, expect, it } from 'vitest';
import { buildMapsDirUrl, buildMapsSearchUrl } from './maps';

describe('buildMapsSearchUrl', () => {
  it('builds a Maps search URL with encoded query', () => {
    const url = buildMapsSearchUrl('Calle Arenales #7, Plaza 25 de Mayo, Sucre');
    expect(url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Calle Arenales #7, Plaza 25 de Mayo, Sucre')}`
    );
  });

  it('trims surrounding whitespace', () => {
    expect(buildMapsSearchUrl('  Sucre  ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Sucre'
    );
  });

  it('encodes special characters', () => {
    expect(buildMapsSearchUrl('Calle #7 & Plaza')).toContain(encodeURIComponent('Calle #7 & Plaza'));
  });
});

describe('buildMapsDirUrl', () => {
  it('omits origin when unknown so Google uses device location', () => {
    expect(buildMapsDirUrl('Chocolates Para Ti, Sucre')).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Chocolates Para Ti, Sucre')}`
    );
  });

  it('includes an explicit origin when provided', () => {
    expect(buildMapsDirUrl('Chocolates Para Ti, Sucre', '-19.0196,-65.2617')).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Chocolates Para Ti, Sucre')}&origin=${encodeURIComponent('-19.0196,-65.2617')}`
    );
  });

  it('encodes destination and trims whitespace', () => {
    expect(buildMapsDirUrl('  Av. Las Americas esquina, Sucre  ')).toContain(
      encodeURIComponent('Av. Las Americas esquina, Sucre')
    );
  });

  it('treats blank origin as omitted', () => {
    expect(buildMapsDirUrl('Sucre', '   ')).not.toContain('&origin=');
  });
});
