const STORAGE_KEY = 'openvolleyscout.sync.deviceId';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'unknown-device';
  }

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, deviceId);
  return deviceId;
}
