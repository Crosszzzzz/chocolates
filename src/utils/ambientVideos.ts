// Ambient background-video URL probing (M6).
//
// No `/videos/*.mp4` assets ship with the repo. This module resolves the
// conventional URLs and probes each one with a HEAD fetch so callers render
// only videos that actually exist — degrading gracefully to zero videos.
// Pure functions + injectable fetch keep it unit-testable; never throws.

import { breakpointFor } from './breakpoints';

export const AMBIENT_VIDEO_URLS = ['/videos/loop1.mp4', '/videos/loop2.mp4'] as const;

/** Hard cap: never render more than this many background videos. */
export const MAX_AMBIENT_VIDEOS = 2;
/** Bandwidth saver: phones render at most one background video. */
export const MOBILE_MAX_AMBIENT_VIDEOS = 1;

export type FetchLike = (
  input: string,
  init?: { method?: string },
) => Promise<{ ok: boolean }>;

function defaultFetch(): FetchLike | null {
  try {
    if (typeof fetch === 'function') return fetch as FetchLike;
    return null;
  } catch {
    return null;
  }
}

/** HEAD-probe a single video URL. False on 404, network error, or no fetch. */
export async function probeVideoUrl(url: string, fetchImpl?: FetchLike): Promise<boolean> {
  const doFetch = fetchImpl ?? defaultFetch();
  if (!doFetch) return false;
  try {
    const res = await doFetch(url, { method: 'HEAD' });
    return res?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Probe `urls` in order and return the subset that exists (order preserved,
 * capped at MAX_AMBIENT_VIDEOS). Resolves [] when nothing exists — never rejects.
 */
export async function probeAmbientVideos(
  urls: readonly string[] = AMBIENT_VIDEO_URLS,
  fetchImpl?: FetchLike,
): Promise<string[]> {
  try {
    const found: string[] = [];
    for (const url of urls.slice(0, MAX_AMBIENT_VIDEOS)) {
      if (await probeVideoUrl(url, fetchImpl)) found.push(url);
    }
    return found;
  } catch {
    return [];
  }
}

/**
 * Cap an already-probed URL list by viewport width:
 * mobile shows at most 1 video, tablet/desktop up to MAX_AMBIENT_VIDEOS.
 */
export function selectAmbientVideos(available: readonly string[], width: number): string[] {
  const cap = breakpointFor(width) === 'mobile' ? MOBILE_MAX_AMBIENT_VIDEOS : MAX_AMBIENT_VIDEOS;
  return available.slice(0, cap);
}
