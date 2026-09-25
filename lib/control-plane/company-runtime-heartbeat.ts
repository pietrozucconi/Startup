import fs from 'node:fs';
import path from 'node:path';

import {
  z,
} from 'zod';


export const CompanyRuntimeHeartbeatSchema =
  z.object({
    processId:
      z.number()
        .int()
        .positive(),

    startedAt:
      z.string()
        .datetime({
          offset:
            true,
        }),

    lastHeartbeatAt:
      z.string()
        .datetime({
          offset:
            true,
        }),

    pollIntervalMs:
      z.number()
        .int()
        .positive(),
  });


export type CompanyRuntimeHeartbeat =
  z.infer<
    typeof CompanyRuntimeHeartbeatSchema
  >;


export function companyRuntimeHeartbeatPath(
  env:
    Readonly<
      Record<
        string,
        string | undefined
      >
    > =
      process.env,
): string {
  return (
    env
      .STARTUP_RUNTIME_HEARTBEAT_PATH
      ?.trim() ??
    path.join(
      process.cwd(),
      'data',
      'local-stack',
      'company-runtime-heartbeat.json',
    )
  );
}


export function writeCompanyRuntimeHeartbeat(
  heartbeat:
    CompanyRuntimeHeartbeat,

  filePath =
    companyRuntimeHeartbeatPath(),
): void {
  const parsed =
    CompanyRuntimeHeartbeatSchema
      .parse(
        heartbeat,
      );


  fs.mkdirSync(
    path.dirname(
      filePath,
    ),
    {
      recursive:
        true,
    },
  );


  const temporaryPath =
    `${filePath}.tmp`;


  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(
      parsed,
      null,
      2,
    ),
    'utf8',
  );


  fs.renameSync(
    temporaryPath,
    filePath,
  );
}


export function readCompanyRuntimeHeartbeat(
  filePath =
    companyRuntimeHeartbeatPath(),
): CompanyRuntimeHeartbeat | null {
  if (
    !fs.existsSync(
      filePath,
    )
  ) {
    return null;
  }


  try {
    return CompanyRuntimeHeartbeatSchema
      .parse(
        JSON.parse(
          fs.readFileSync(
            filePath,
            'utf8',
          ),
        ),
      );
  } catch {
    return null;
  }
}


export function clearCompanyRuntimeHeartbeat(
  filePath =
    companyRuntimeHeartbeatPath(),
): void {
  fs.rmSync(
    filePath,
    {
      force:
        true,
    },
  );
}