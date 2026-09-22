import fs from 'node:fs';
import path from 'node:path';

const file = path.join(
  process.cwd(),
  'lib',
  'control-plane',
  'atomic-engine.ts',
);

const original =
  fs.readFileSync(
    file,
    'utf8',
  );

if (
  original.includes(
    "fingerprintControlPlaneRequest",
  )
) {
  console.log(
    'V2I.1 atomic-engine patch already present.',
  );

  process.exit(0);
}

let next = original;

function replaceOnce(
  label,
  search,
  replacement,
) {
  const first =
    next.indexOf(search);

  if (first === -1) {
    throw new Error(
      `V2I.1 patch failed: missing anchor "${label}". No files were written.`,
    );
  }

  const second =
    next.indexOf(
      search,
      first + search.length,
    );

  if (second !== -1) {
    throw new Error(
      `V2I.1 patch failed: anchor "${label}" is not unique. No files were written.`,
    );
  }

  next =
    next.slice(0, first) +
    replacement +
    next.slice(
      first + search.length,
    );
}

replaceOnce(
  'request-fingerprint import',
  `import type {
  AtomicControlPlaneCommitInput,
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

`,
  `import type {
  AtomicControlPlaneCommitInput,
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

import {
  fingerprintControlPlaneRequest,
} from '@/lib/control-plane/request-fingerprint';

`,
);

replaceOnce(
  'integrity helper',
  `  private async duplicateWorkflowResult(
`,
  `  private async reserveRequestIntegrity(
    request: {
      requestId: string;
      [key: string]: unknown;
    },
  ): Promise<void> {
    const fingerprint =
      fingerprintControlPlaneRequest(
        request,
      );

    await this.store.reserveRequestFingerprint({
      requestId:
        request.requestId,
      fingerprint,
      observedAt:
        this.clock(),
    });
  }

  private async duplicateWorkflowResult(
`,
);

const schemas = [
  'CreateWorkflowRequestSchema',
  'RegisterArtifactRequestSchema',
  'TransitionRequestSchema',
  'RecordInvalidationRequestSchema',
  'ResolveInvalidationRequestSchema',
  'FinancialActionRequestSchema',
];

for (const schema of schemas) {
  const regex = new RegExp(
    `(const request\\s*=\\s*${schema}\\.parse\\([\\s\\S]*?\\);)`,
  );

  const match =
    next.match(regex);

  if (!match) {
    throw new Error(
      `V2I.1 patch failed: could not locate parsed request for ${schema}. No files were written.`,
    );
  }

  const full =
    match[1];

  const replacement =
    `${full}

    await this.reserveRequestIntegrity(
      request,
    );`;

  next =
    next.replace(
      full,
      replacement,
    );
}

fs.writeFileSync(
  file,
  next,
  'utf8',
);

console.log(
  'Applied V2I.1 request-integrity patch to lib/control-plane/atomic-engine.ts',
);
