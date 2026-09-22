import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import {
  HmacRuntimeIdentityAuthority,
} from '@/lib/control-plane/runtime-identity';

describe(
  'V2I.2A runtime identity',
  () => {
    test(
      'issues and verifies a signed agent session bound to the runtime profile',
      () => {
        const profile =
          getCompanyAgentRuntimeProfile(
            'lauti',
          );

        const authority =
          new HmacRuntimeIdentityAuthority(
            '0123456789abcdef0123456789abcdef',
            () =>
              '2026-01-01T00:00:00.000Z',
            () =>
              'session-lauti-1',
          );

        const issued =
          authority
            .issueAgentSession({
              profile,
              ttlMs:
                60_000,
            });

        const claims =
          authority
            .verifyAgentSession({
              token:
                issued.token,

              expectedProfile:
                profile,

              now:
                '2026-01-01T00:00:30.000Z',
            });

        expect(
          claims,
        ).toMatchObject({
          sessionId:
            'session-lauti-1',

          agentId:
            'lauti',

          departmentId:
            'dept-research',

          actor: {
            kind: 'agent',
            id: 'lauti',
          },

          issuedBy:
            'company-control-plane',
        });

        expect(
          claims.capabilities,
        ).toContain(
          'agent.runtime.execute',
        );
      },
    );

    test(
      'rejects tampering, wrong agent binding and expiry',
      () => {
        const lauti =
          getCompanyAgentRuntimeProfile(
            'lauti',
          );

        const pepo =
          getCompanyAgentRuntimeProfile(
            'pepo',
          );

        const authority =
          new HmacRuntimeIdentityAuthority(
            '0123456789abcdef0123456789abcdef',
            () =>
              '2026-01-01T00:00:00.000Z',
            () =>
              'session-lauti-1',
          );

        const issued =
          authority
            .issueAgentSession({
              profile:
                lauti,

              ttlMs:
                60_000,
            });

        const tampered =
          `${issued.token.slice(0, -1)}A`;

        expect(() =>
          authority
            .verifyAgentSession({
              token:
                tampered,

              expectedProfile:
                lauti,

              now:
                '2026-01-01T00:00:30.000Z',
            }),
        ).toThrow(
          'runtime_identity_signature_invalid',
        );

        expect(() =>
          authority
            .verifyAgentSession({
              token:
                issued.token,

              expectedProfile:
                pepo,

              now:
                '2026-01-01T00:00:30.000Z',
            }),
        ).toThrow(
          'runtime_identity_agent_mismatch:pepo',
        );

        expect(() =>
          authority
            .verifyAgentSession({
              token:
                issued.token,

              expectedProfile:
                lauti,

              now:
                '2026-01-01T00:01:00.000Z',
            }),
        ).toThrow(
          'runtime_identity_expired',
        );
      },
    );
  },
);
