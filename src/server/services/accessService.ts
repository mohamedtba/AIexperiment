import 'server-only';

import { settingsRepository } from '../db/repositories/settings';
import { ensureSchemaOnce } from '../db/client';
import type { AccessSettings } from '@/types';

let cached: { value: AccessSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 2000;

/**
 * Student access settings with a very short in-memory cache, to avoid one
 * database round-trip per API call while keeping the global switch responsive.
 */
export async function getAccessSettings(): Promise<AccessSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  // Every authenticated request goes through here: this is where the schema
  // (unique usernames, single ACTIVE experiment...) is guaranteed to exist.
  await ensureSchemaOnce();

  const value = await settingsRepository.getAccessSettings();
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function updateStudentAccess(enabled: boolean): Promise<AccessSettings> {
  const value = await settingsRepository.setStudentAccessEnabled(enabled);
  cached = null;
  return value;
}

export function invalidateAccessCache(): void {
  cached = null;
}

export function isStudentAccessEnabled(): Promise<boolean> {
  return getAccessSettings().then((settings) => settings.studentAccessEnabled);
}