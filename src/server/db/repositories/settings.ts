import 'server-only';

import { queryOne } from '../client';
import { mapAccessSettings, type AccessSettingsRow } from '../rows';
import type { AccessSettings } from '@/types';

const SETTINGS_KEY = 'global';

const SELECT_ACCESS = `select student_access_enabled, access_epoch, updated_at, disabled_at, login_ai_libre, login_ai_guidee
                         from system_settings
                        where key = $1`;

/** Global application settings (currently the student access switch). */
export const settingsRepository = {
  /** Reads the switch, creating the default row on first use. */
  async getAccessSettings(): Promise<AccessSettings> {
    const row = await readOrCreate();
    return mapAccessSettings(row);
  },

  /**
   * Enables or disables student access. Every change increments the epoch,
   * which instantly invalidates all previously issued student sessions.
   */
  async setStudentAccessEnabled(enabled: boolean): Promise<AccessSettings> {
    const row = await queryOne<AccessSettingsRow>(
      `insert into system_settings (key, student_access_enabled, access_epoch, updated_at, disabled_at)
            values ($1, $2, 1, now(), case when $2 then null else now() end)
       on conflict (key) do update
              set student_access_enabled = excluded.student_access_enabled,
                  updated_at = now(),
                  disabled_at = excluded.disabled_at,
                  access_epoch = system_settings.access_epoch + 1
         returning student_access_enabled, access_epoch, updated_at, disabled_at`,
      [SETTINGS_KEY, enabled],
    );
    if (!row) throw new Error("Mise a jour des reglages impossible.");
    return mapAccessSettings(row);
  },

  /**
   * Enables or forbids a single student group to sign in. The existing session
   * of the forbidden group is refused on the next request, the other group's
   * sessions are untouched.
   */
  async setGroupLoginAllowed(group: 'AI_LIBRE' | 'AI_GUIDEE', allowed: boolean): Promise<AccessSettings> {
    const column = group === 'AI_LIBRE' ? 'login_ai_libre' : 'login_ai_guidee';
    // The column name is fixed by the branch above; only the value is a bound param.
    const row = await queryOne<AccessSettingsRow>(
      `update system_settings set ${column} = $2, updated_at = now() where key = $1
        returning student_access_enabled, access_epoch, updated_at, disabled_at,
                  login_ai_libre, login_ai_guidee`,
      [SETTINGS_KEY, allowed],
    );
    if (!row) throw new Error('Mise a jour des reglages impossible.');
    return mapAccessSettings(row);
  },
};

async function readOrCreate(): Promise<AccessSettingsRow> {
  const existing = await queryOne<AccessSettingsRow>(SELECT_ACCESS, [SETTINGS_KEY]);
  if (existing) return existing;

  // Two servers may reach this point at the same time: the conflict clause keeps
  // a single row and the second writer simply reads it back.
  const created = await queryOne<AccessSettingsRow>(
    `insert into system_settings (key, student_access_enabled, access_epoch, updated_at)
          values ($1, true, 1, now())
     on conflict (key) do update set key = excluded.key
     returning student_access_enabled, access_epoch, updated_at, disabled_at`,
    [SETTINGS_KEY],
  );
  if (!created) throw new Error('Reglages systeme introuvables.');
  return created;
}

/** Atomic counters (experiment numbering, expression version numbering). */
export const counterRepository = {
  /**
   * Increments a counter and returns its new value in a single atomic
   * statement, so two concurrent submissions can never share a number.
   */
  async nextValue(key: string): Promise<number> {
    const row = await queryOne<{ value: number }>(
      `insert into counters (key, value)
            values ($1, 1)
       on conflict (key) do update
              set value = counters.value + 1
         returning value`,
      [key],
    );
    return row?.value ?? 1;
  },
};