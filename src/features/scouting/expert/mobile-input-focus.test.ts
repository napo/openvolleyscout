import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAllowAutoFocusForInput } from './mobile-input-focus';

test('shouldAllowAutoFocusForInput blocks iPadOS / iOS Safari keyboard focus', () => {
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5), false);
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5), false);
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5), false);
});

test('shouldAllowAutoFocusForInput preserves desktop behavior', () => {
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, false), true);
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, false), true);
});

test('shouldAllowAutoFocusForInput blocks any touch-primary device via pointer media feature', () => {
  // Android tablet
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 5, true), false);
  // Windows tablet in tablet-mode
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 10, true), false);
});

test('shouldAllowAutoFocusForInput does not block touchscreen laptops with a mouse as primary pointer', () => {
  assert.equal(shouldAllowAutoFocusForInput('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 10, false), true);
});
