import fs from 'node:fs';
import path from 'node:path';

import {
  SqliteHardenedRuntimeStore,
} from '@/lib/control-plane/sqlite-hardened-runtime-store';

let instance:
  | SqliteHardenedRuntimeStore
  | null = null;

export function getControlPlaneRuntimeStore():
  SqliteHardenedRuntimeStore {
  if (instance) {
    return instance;
  }

  const dbPath =
    process.env.STARTUP_CONTROL_PLANE_DB ??
    path.join(
      process.cwd(),
      'data',
      'control-plane.db',
    );

  if (
    dbPath !== ':memory:'
  ) {
    fs.mkdirSync(
      path.dirname(dbPath),
      {
        recursive: true,
      },
    );
  }

  instance =
    new SqliteHardenedRuntimeStore(
      dbPath,
    );

  return instance;
}
