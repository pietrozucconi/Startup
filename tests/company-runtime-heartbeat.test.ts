import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test,
} from 'vitest';

import {
  clearCompanyRuntimeHeartbeat,
  readCompanyRuntimeHeartbeat,
  writeCompanyRuntimeHeartbeat,
} from '@/lib/control-plane/company-runtime-heartbeat';


const temporaryDirectories:
  string[] =
  [];


function temporaryHeartbeatPath():
  string {
  const directory =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'startup-runtime-heartbeat-',
      ),
    );


  temporaryDirectories.push(
    directory,
  );


  return path.join(
    directory,
    'heartbeat.json',
  );
}


afterEach(
  () => {
    for (
      const directory
      of temporaryDirectories
        .splice(
          0,
        )
    ) {
      fs.rmSync(
        directory,
        {
          recursive:
            true,

          force:
            true,
        },
      );
    }
  },
);


describe(
  'company runtime heartbeat',
  () => {
    test(
      'persists and reads runtime liveness',
      () => {
        const filePath =
          temporaryHeartbeatPath();


        writeCompanyRuntimeHeartbeat(
          {
            processId:
              12345,

            startedAt:
              '2026-09-24T12:00:00.000Z',

            lastHeartbeatAt:
              '2026-09-24T12:00:02.000Z',

            pollIntervalMs:
              2000,
          },
          filePath,
        );


        expect(
          readCompanyRuntimeHeartbeat(
            filePath,
          ),
        ).toEqual({
          processId:
            12345,

          startedAt:
            '2026-09-24T12:00:00.000Z',

          lastHeartbeatAt:
            '2026-09-24T12:00:02.000Z',

          pollIntervalMs:
            2000,
        });
      },
    );


    test(
      'clears runtime heartbeat on controlled shutdown',
      () => {
        const filePath =
          temporaryHeartbeatPath();


        writeCompanyRuntimeHeartbeat(
          {
            processId:
              12345,

            startedAt:
              '2026-09-24T12:00:00.000Z',

            lastHeartbeatAt:
              '2026-09-24T12:00:02.000Z',

            pollIntervalMs:
              2000,
          },
          filePath,
        );


        clearCompanyRuntimeHeartbeat(
          filePath,
        );


        expect(
          readCompanyRuntimeHeartbeat(
            filePath,
          ),
        ).toBeNull();
      },
    );
  },
);