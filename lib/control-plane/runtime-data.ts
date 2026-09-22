import fs from 'node:fs';
import path from 'node:path';
import { SqliteInternalRuntimeStore } from '@/lib/control-plane/sqlite-runtime-store';
let instance: SqliteInternalRuntimeStore | null = null;
export function getControlPlaneRuntimeStore(): SqliteInternalRuntimeStore {
  if (instance) return instance;
  const dbPath = process.env.STARTUP_CONTROL_PLANE_DB ?? path.join(process.cwd(),'data','control-plane.db');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  instance = new SqliteInternalRuntimeStore(dbPath);
  return instance;
}
