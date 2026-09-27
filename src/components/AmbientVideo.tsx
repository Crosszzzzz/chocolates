import React, { useEffect, useRef, useState } from 'react';
import {
  AMBIENT_VIDEO_URLS,
  probeAmbientVideos,
  selectAmbientVideos,
} from '../utils/ambientVideos';

/**
 * Ambient background videos mounted once at the app root, behind the 3D canvas.
 *
 * - Probes `/videos/loop1.mp4` + `/videos/loop2.mp4` with HEAD requests and
 *   renders only the ones that exist (zero videos → renders nothing).
 * - Mobile viewports render at most 1 video (bandwidth); tablet/desktop up to 2.
 * - Respects `prefers-reduced-motion`: no autoplay when set.
 * - Pauses all videos when the tab is hidden, resumes when visible.
 */
export const AmbientVideo: React.FC = () => {
  const [sources, setSources] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  });
  const videosRef = useRef<HTMLVideoElement[]>([]);

  // Track the prefers-reduced-motion setting live.
  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      return undefined;
    }
  }, []);

  // Probe which video assets actually exist; degrade to zero videos gracefully.
  useEffect(() => {
    let cancelled = false;
    void probeAmbientVideos(AMBIENT_VIDEO_URLS).then((found) => {
      if (cancelled) return;
      try {
        setSources(selectAmbientVideos(found, window.innerWidth));
      } catch {
        setSources(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure the muted property is set (React renders the attribute, but the
  // autoplay policy reads the IDL property) whenever sources change.
  useEffect(() => {
    videosRef.current.forEach((v) => {
      try {
        v.muted = true;
        if (!reducedMotion && document.visibilityState === 'visible') {
          void v.play().catch(() => {
            // Autoplay blocked or no asset yet: stay paused, background stays gradient.
          });
        }
      } catch {
        // Non-fatal: ambient layer must never break the app.
      }
    });
  }, [sources, reducedMotion]);

  // Pause when the tab is hidden; resume when visible (unless reduced motion).
  useEffect(() => {
    const onVisibility = () => {
      videosRef.current.forEach((v) => {
        try {
          if (document.hidden) {
            v.pause();
          } else if (!reducedMotion) {
            void v.play().catch(() => undefined);
          }
        } catch {
          // Ignore per-video errors.
        }
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [reducedMotion]);

  if (sources.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {sources.map((src, i) => (
        <video
          key={src}
          ref={(el) => {
            if (el) videosRef.current[i] = el;
          }}
          src={src}
          className="absolute inset-0 h-full w-full object-cover opacity-40"
          muted
          loop
          playsInline
          autoPlay={!reducedMotion}
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
        />
      ))}
    </div>
  );
};
