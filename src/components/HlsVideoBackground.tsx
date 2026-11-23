import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolveHlsPlaybackMode } from '../utils/hls';

interface HlsVideoBackgroundProps {
  /** Optional HLS (.m3u8) stream URL. Falls back seamlessly to static cinematic imagery if omitted or unavailable. */
  src?: string;
  /** High-resolution local static fallback backdrop rendered immediately and on reduced-motion / load failure. */
  fallbackImage: string;
}

export function HlsVideoBackground({ src, fallbackImage }: HlsVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const nativeSupported = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    const mode = resolveHlsPlaybackMode({
      url: src,
      reducedMotion,
      nativeHlsSupported: nativeSupported,
      hlsJsSupported: Hls.isSupported(),
    });

    setVideoReady(false);
    setStreamFailed(false);

    if (mode === 'fallback' || !src) {
      return;
    }

    let hls: Hls | null = null;
    let cancelled = false;

    const tryPlay = () => {
      if (cancelled || !video) return;
      video.play().catch(() => {
        // Autoplay blocked — keep crisp static fallback visible
      });
    };

    if (mode === 'native') {
      video.src = src;
      video.load();
      tryPlay();
    } else if (mode === 'hls.js') {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        maxBufferLength: 18,
        backBufferLength: 12,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        tryPlay();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStreamFailed(true);
          setVideoReady(false);
          hls?.destroy();
          hls = null;
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
    }

    return () => {
      cancelled = true;
      if (hls) {
        hls.destroy();
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, reducedMotion]);

  const showVideo = Boolean(src) && !reducedMotion && !streamFailed;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#070709]" aria-hidden="true">
      {/* Instantaneous Static Architectural Fallback Backdrop */}
      <img
        src={fallbackImage}
        alt=""
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover object-center opacity-90 select-none"
      />

      {/* Full-Viewport HLS Video Layer (Crossfades in smoothly once playing) */}
      {showVideo && (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onPlaying={() => setVideoReady(true)}
          onError={() => {
            setStreamFailed(true);
            setVideoReady(false);
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            videoReady ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Measured Dark Readability Scrim (Stronger on the right to frame the glass login card) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(105deg, rgba(9, 9, 11, 0.42) 0%, rgba(9, 9, 11, 0.62) 48%, rgba(9, 9, 11, 0.84) 100%)',
        }}
      />

      {/* Subtle Bottom & Top Edge Vignette for Header and Footer Legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(9, 9, 11, 0.56) 0%, rgba(9, 9, 11, 0.06) 24%, rgba(9, 9, 11, 0.14) 76%, rgba(9, 9, 11, 0.72) 100%)',
        }}
      />
    </div>
  );
}
