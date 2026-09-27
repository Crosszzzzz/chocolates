import { describe, expect, it, vi } from 'vitest';
import {
  AMBIENT_VIDEO_URLS,
  MAX_AMBIENT_VIDEOS,
  MOBILE_MAX_AMBIENT_VIDEOS,
  probeAmbientVideos,
  probeVideoUrl,
  selectAmbientVideos,
  type FetchLike,
} from './ambientVideos';

function mockFetch(handler: (url: string) => boolean | Promise<boolean>): FetchLike {
  return vi.fn(async (url: string) => ({ ok: await handler(url) }));
}

describe('probeVideoUrl', () => {
  it('returns true when the HEAD probe responds ok', async () => {
    await expect(probeVideoUrl('/videos/loop1.mp4', mockFetch(() => true))).resolves.toBe(true);
  });

  it('returns false on 404 (missing asset)', async () => {
    await expect(probeVideoUrl('/videos/loop1.mp4', mockFetch(() => false))).resolves.toBe(false);
  });

  it('returns false when fetch rejects (offline / network error)', async () => {
    const failing: FetchLike = () => Promise.reject(new Error('offline'));
    await expect(probeVideoUrl('/videos/loop1.mp4', failing)).resolves.toBe(false);
  });

  it('uses a HEAD request for the probe', async () => {
    const spy = vi.fn(async (_url: string) => ({ ok: true }));
    await probeVideoUrl('/videos/loop1.mp4', spy);
    expect(spy).toHaveBeenCalledWith('/videos/loop1.mp4', { method: 'HEAD' });
  });
});

describe('probeAmbientVideos', () => {
  it('renders only the URLs that exist, preserving order', async () => {
    const result = await probeAmbientVideos(
      ['/videos/loop1.mp4', '/videos/loop2.mp4'],
      mockFetch((url) => url.endsWith('loop2.mp4')),
    );
    expect(result).toEqual(['/videos/loop2.mp4']);
  });

  it('degrades to zero videos when no assets exist', async () => {
    const result = await probeAmbientVideos(
      [...AMBIENT_VIDEO_URLS],
      mockFetch(() => false),
    );
    expect(result).toEqual([]);
  });

  it('returns both videos when both exist (capped at the max)', async () => {
    const result = await probeAmbientVideos([...AMBIENT_VIDEO_URLS], mockFetch(() => true));
    expect(result).toEqual([...AMBIENT_VIDEO_URLS]);
    expect(result.length).toBeLessThanOrEqual(MAX_AMBIENT_VIDEOS);
  });

  it('caps over-long URL lists at MAX_AMBIENT_VIDEOS', async () => {
    const result = await probeAmbientVideos(
      ['/videos/loop1.mp4', '/videos/loop2.mp4', '/videos/loop3.mp4'],
      mockFetch(() => true),
    );
    expect(result).toHaveLength(MAX_AMBIENT_VIDEOS);
  });

  it('never rejects when fetch throws for every URL', async () => {
    const failing: FetchLike = () => Promise.reject(new Error('offline'));
    await expect(probeAmbientVideos([...AMBIENT_VIDEO_URLS], failing)).resolves.toEqual([]);
  });
});

describe('selectAmbientVideos', () => {
  it('caps mobile (360) at a single video to save bandwidth', () => {
    expect(selectAmbientVideos(['/videos/loop1.mp4', '/videos/loop2.mp4'], 360)).toEqual([
      '/videos/loop1.mp4',
    ]);
    expect(MOBILE_MAX_AMBIENT_VIDEOS).toBe(1);
  });

  it('allows up to the max on tablet (768) and desktop (1440)', () => {
    const both = ['/videos/loop1.mp4', '/videos/loop2.mp4'];
    expect(selectAmbientVideos(both, 768)).toEqual(both);
    expect(selectAmbientVideos(both, 1440)).toEqual(both);
  });

  it('passes through short lists untouched', () => {
    expect(selectAmbientVideos([], 360)).toEqual([]);
    expect(selectAmbientVideos(['/videos/loop1.mp4'], 1440)).toEqual(['/videos/loop1.mp4']);
  });
});
