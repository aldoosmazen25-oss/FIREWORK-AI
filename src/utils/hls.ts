export type HlsPlaybackMode = 'fallback' | 'native' | 'hls.js';

export interface HlsPlaybackContext {
  url?: string | null;
  reducedMotion: boolean;
  nativeHlsSupported: boolean;
  hlsJsSupported: boolean;
}

/**
 * Checks whether a media URL points to an HLS manifest (.m3u8),
 * safely handling query strings and hash fragments.
 */
export function isHlsStreamUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, 'https://firework.local');
    return parsed.pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return /\.m3u8(?:[?#].*)?$/i.test(trimmed);
  }
}

/**
 * Deterministic playback strategy resolver for the login video backdrop.
 * Honors prefers-reduced-motion first, validates the .m3u8 URL, then prefers
 * native Safari HLS before falling back to hls.js or the static image backdrop.
 */
export function resolveHlsPlaybackMode(ctx: HlsPlaybackContext): HlsPlaybackMode {
  if (ctx.reducedMotion) return 'fallback';
  if (!isHlsStreamUrl(ctx.url)) return 'fallback';
  if (ctx.nativeHlsSupported) return 'native';
  if (ctx.hlsJsSupported) return 'hls.js';
  return 'fallback';
}
