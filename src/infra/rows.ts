import { JobStatus } from '../domain/job-status';

// Tipos das linhas do Postgres (schema em migrations/001_init.sql). pg devolve bigint como
// string e timestamptz como string ISO; refletido aqui. Substituem o `any` das leituras.

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

export interface VideoRow {
  id: string;
  owner_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: string;
  checksum: string;
  storage_key: string;
  created_at: string;
}

export interface JobRow {
  id: string;
  owner_id: string;
  video_id: string;
  status: JobStatus;
  archive_storage_key: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Projeção da listagem (SELECT enxuto, sem owner_id). */
export type JobListRow = Pick<
  JobRow,
  'id' | 'video_id' | 'status' | 'archive_storage_key' | 'created_at'
>;
