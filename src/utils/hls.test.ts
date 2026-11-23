import test from 'node:test';
import assert from 'node:assert/strict';
import { isHlsStreamUrl, resolveHlsPlaybackMode } from './hls';
import { translations } from '../i18n/translations';

test('isHlsStreamUrl detects valid .m3u8 URLs with or without query params', () => {
  assert.equal(isHlsStreamUrl('https://cdn.example.com/live/ambient.m3u8'), true);
  assert.equal(isHlsStreamUrl('https://cdn.example.com/stream.M3U8?token=abc123'), true);
  assert.equal(isHlsStreamUrl('/videos/background.m3u8'), true);
  assert.equal(isHlsStreamUrl('https://cdn.example.com/video.mp4'), false);
  assert.equal(isHlsStreamUrl(''), false);
  assert.equal(isHlsStreamUrl(null), false);
});

test('resolveHlsPlaybackMode always respects reduced-motion preference', () => {
  assert.equal(
    resolveHlsPlaybackMode({
      url: 'https://cdn.example.com/ambient.m3u8',
      reducedMotion: true,
      nativeHlsSupported: true,
      hlsJsSupported: true,
    }),
    'fallback',
  );
});

test('resolveHlsPlaybackMode prefers native HLS over hls.js and falls back cleanly', () => {
  assert.equal(
    resolveHlsPlaybackMode({
      url: 'https://cdn.example.com/ambient.m3u8',
      reducedMotion: false,
      nativeHlsSupported: true,
      hlsJsSupported: true,
    }),
    'native',
  );

  assert.equal(
    resolveHlsPlaybackMode({
      url: 'https://cdn.example.com/ambient.m3u8',
      reducedMotion: false,
      nativeHlsSupported: false,
      hlsJsSupported: true,
    }),
    'hls.js',
  );

  assert.equal(
    resolveHlsPlaybackMode({
      url: 'https://cdn.example.com/ambient.m3u8',
      reducedMotion: false,
      nativeHlsSupported: false,
      hlsJsSupported: false,
    }),
    'fallback',
  );

  assert.equal(
    resolveHlsPlaybackMode({
      url: '',
      reducedMotion: false,
      nativeHlsSupported: true,
      hlsJsSupported: true,
    }),
    'fallback',
  );
});

test('Arabic dashboard and auth translations contain zero missing keys or English leftovers', () => {
  const arDash = translations.ar.dashboard;
  const enDash = translations.en.dashboard;

  for (const key of Object.keys(enDash) as Array<keyof typeof enDash>) {
    const arValue = arDash[key];
    assert.ok(arValue !== undefined, `Missing Arabic dashboard key: ${key}`);
    if (typeof arValue === 'string') {
      assert.ok(arValue.trim().length > 0, `Empty Arabic dashboard key: ${key}`);
    }
  }

  // Ensure specifically reported English strings are fully translated in Arabic
  const forbiddenEnglish = [
    'Operating Mode',
    'Manage all',
    'Explore directory',
    'No scheduled deadlines',
    'Activity records will appear here',
  ];
  const serializedArDashboard = JSON.stringify(arDash);
  for (const phrase of forbiddenEnglish) {
    assert.equal(
      serializedArDashboard.includes(phrase),
      false,
      `Found untranslated English phrase in Arabic dashboard translations: ${phrase}`,
    );
  }
});
