import 'server-only';

import { execute, query, queryOne } from '../client';
import { isUuid } from '../ids';
import type { AdminAuthRow } from '../rows';
import type { AdminPublic, StudentPublic } from '@/types';

interface AdminPublicRow {
  id: string;
  username: string;
  created_at: Date;
  last_login_at: Date | null;
}

interface StudentPublicRow {
  id: string;
  username: string;
  created_at: Date;
  last_login_at: Date | null;
}

/** Data access for the single administrator account. */
export const adminRepository = {
  async findByUsername(username: string): Promise<AdminAuthRow | null> {
    return queryOne<AdminAuthRow>(
      `select id, username, password_hash, created_at, last_login_at
         from admins
        where username = $1`,
      [username],
    );
  },

  async findById(id: string): Promise<AdminPublic | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<AdminPublicRow>(
      'select id, username, created_at, last_login_at from admins where id = $1',
      [id],
    );
    return row
      ? {
          id: row.id,
          username: row.username,
          createdAt: row.created_at,
          lastLoginAt: row.last_login_at,
        }
      : null;
  },

  async count(): Promise<number> {
    const row = await queryOne<{ total: string }>(
      'select count(*)::text as total from admins',
    );
    return Number(row?.total ?? 0);
  },

  /** Creates the administrator or updates the password of the existing account. */
  async upsertByUsername(
    username: string,
    passwordHash: string,
  ): Promise<{ account: AdminPublic; created: boolean }> {
    const rows = await query<AdminPublicRow & { created: boolean }>(
      `insert into admins (username, password_hash)
            values ($1, $2)
       on conflict (username) do update
              set password_hash = excluded.password_hash,
                  last_login_at = null
         returning id, username, created_at, last_login_at,
                   (xmax = 0) as created`,
      [username, passwordHash],
    );
    const row = rows[0];
    if (!row) throw new Error("Enregistrement de l'administrateur impossible.");
    return {
      account: {
        id: row.id,
        username: row.username,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      },
      created: row.created,
    };
  },

  async touchLastLogin(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await execute('update admins set last_login_at = now() where id = $1', [id]);
  },
};

/** Data access for student accounts (created by the administrator only). */
export const studentRepository = {
  async findByUsername(username: string): Promise<AdminAuthRow | null> {
    return queryOne<AdminAuthRow>(
      `select id, username, password_hash, password_version, created_at, last_login_at
         from students
        where username = $1`,
      [username],
    );
  },

  async findById(id: string): Promise<StudentPublic | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<StudentPublicRow>(
      'select id, username, created_at, last_login_at from students where id = $1',
      [id],
    );
    return row ? toStudentPublic(row) : null;
  },

  async existsByUsername(username: string): Promise<boolean> {
    const row = await queryOne<{ present: boolean }>(
      'select true as present from students where username = $1',
      [username],
    );
    return row !== null;
  },

  async insert(username: string, passwordHash: string): Promise<StudentPublic> {
    const row = await queryOne<StudentPublicRow>(
      `insert into students (username, password_hash)
            values ($1, $2)
         returning id, username, created_at, last_login_at`,
      [username, passwordHash],
    );
    if (!row) throw new Error("Insertion de l'etudiant impossible.");
    return toStudentPublic(row)!;
  },

  /** Password version used to invalidate sessions after a reset. */
  async getPasswordVersion(id: string): Promise<number | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<{ password_version: number }>(
      'select password_version from students where id = $1',
      [id],
    );
    return row ? row.password_version : null;
  },

  async findAuthById(
    id: string,
  ): Promise<{ username: string; passwordVersion: number } | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<{ username: string; password_version: number }>(
      'select username, password_version from students where id = $1',
      [id],
    );
    return row ? { username: row.username, passwordVersion: row.password_version } : null;
  },

  /**
   * Replaces the password hash and increments the version, which invalidates the
   * sessions created with the previous password. Returns the new version, or
   * null when the account does not exist.
   */
  async resetPassword(id: string, passwordHash: string): Promise<number | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<{ password_version: number }>(
      `update students
          set password_hash = $2,
              password_version = password_version + 1,
              updated_at = now()
        where id = $1
      returning password_version`,
      [id, passwordHash],
    );
    return row ? row.password_version : null;
  },

  async list(limit = 500, offset = 0): Promise<StudentPublic[]> {
    const rows = await query<StudentPublicRow>(
      `select id, username, created_at, last_login_at
         from students
        order by created_at desc
        limit $1 offset $2`,
      [limit, offset],
    );
    return rows.map(toStudentPublic);
  },

  async listByIds(ids: string[]): Promise<StudentPublic[]> {
    const validIds = ids.filter(isUuid);
    if (validIds.length === 0) return [];
    const rows = await query<StudentPublicRow>(
      'select id, username, created_at, last_login_at from students where id = any($1::uuid[])',
      [validIds],
    );
    return rows.map(toStudentPublic);
  },

  async count(): Promise<number> {
    const row = await queryOne<{ total: string }>(
      'select count(*)::text as total from students',
    );
    return Number(row?.total ?? 0);
  },

  async touchLastLogin(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await execute('update students set last_login_at = now() where id = $1', [id]);
  },
};

function toStudentPublic(row: StudentPublicRow): StudentPublic {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}