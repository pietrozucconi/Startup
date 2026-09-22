import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { z } from 'zod';

import {
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  CompanyAgentRuntimeProfileSchema,
  type CompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

export const RuntimeIdentityCapabilitySchema = z.enum([
  'agent.runtime.execute',
  'agent.tools.read',
  'brain.read',
  'brain.retrieve',
]);

export const RuntimeAgentSessionClaimsSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),

  actor: z.object({
    kind: z.literal('agent'),
    id: z.string().min(1),
  }),

  agentId: z.string().min(1),

  departmentId: z.enum([
    'dept-research',
    'dept-risk',
    'dept-monitoring',
  ]),

  capabilities:
    z.array(
      RuntimeIdentityCapabilitySchema,
    )
    .min(1),

  profileDigest:
    z.string().regex(
      /^sha256:[a-f0-9]{64}$/,
    ),

  issuedAt:
    TimestampSchema,

  expiresAt:
    TimestampSchema,

  issuedBy:
    z.literal(
      'company-control-plane',
    ),
});

export type RuntimeAgentSessionClaims = z.infer<
  typeof RuntimeAgentSessionClaimsSchema
>;

export interface RuntimeIdentityVerifier {
  verifyAgentSession(input: {
    token: string;
    expectedProfile:
      CompanyAgentRuntimeProfile;
    now?: string;
  }): RuntimeAgentSessionClaims;
}

function stableCanonicalize(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      stableCanonicalize,
    );
  }

  if (
    typeof value === 'object'
  ) {
    const source =
      value as Record<
        string,
        unknown
      >;

    const result:
      Record<string, unknown> = {};

    for (
      const key of Object.keys(
        source,
      ).sort()
    ) {
      const child =
        source[key];

      if (
        child === undefined
      ) {
        continue;
      }

      result[key] =
        stableCanonicalize(
          child,
        );
    }

    return result;
  }

  throw new Error(
    `runtime_identity_unsupported_profile_value:${typeof value}`,
  );
}

function encodeBase64Url(
  value: string | Buffer,
): string {
  return Buffer
    .from(value)
    .toString('base64url');
}

function parseTimestampMs(
  value: string,
): number {
  const parsed =
    Date.parse(value);

  if (
    !Number.isFinite(parsed)
  ) {
    throw new Error(
      'runtime_identity_invalid_timestamp',
    );
  }

  return parsed;
}

function ensureSecretStrength(
  secret:
    | string
    | Buffer,
): Buffer {
  const bytes =
    Buffer.isBuffer(secret)
      ? Buffer.from(secret)
      : Buffer.from(
          secret,
          'utf8',
        );

  if (
    bytes.length < 32
  ) {
    throw new Error(
      'runtime_identity_signing_secret_too_short',
    );
  }

  return bytes;
}

export function digestCompanyAgentRuntimeProfile(
  rawProfile:
    CompanyAgentRuntimeProfile,
): string {
  const profile =
    CompanyAgentRuntimeProfileSchema.parse(
      rawProfile,
    );

  const canonical =
    JSON.stringify(
      stableCanonicalize(
        profile,
      ),
    );

  return `sha256:${createHash('sha256')
    .update(
      canonical,
      'utf8',
    )
    .digest('hex')}`;
}

/**
 * Foundation implementation of trusted runtime-session issuance.
 *
 * Tokens contain only signed identity claims. The HMAC secret stays in trusted
 * infrastructure and is never exposed to models, tools or runtime tasks.
 */
export class HmacRuntimeIdentityAuthority
  implements RuntimeIdentityVerifier
{
  private readonly secret:
    Buffer;

  constructor(
    secret:
      | string
      | Buffer,
    private readonly clock: () => string = () =>
      new Date().toISOString(),
    private readonly sessionIdFactory:
      () => string = randomUUID,
  ) {
    this.secret =
      ensureSecretStrength(
        secret,
      );
  }

  issueAgentSession(input: {
    profile:
      CompanyAgentRuntimeProfile;

    ttlMs: number;
  }): {
    token: string;
    claims:
      RuntimeAgentSessionClaims;
  } {
    if (
      input.ttlMs <= 0 ||
      input.ttlMs >
        24 * 60 * 60 * 1000
    ) {
      throw new Error(
        'runtime_identity_invalid_ttl',
      );
    }

    const profile =
      CompanyAgentRuntimeProfileSchema.parse(
        input.profile,
      );

    const issuedAt =
      this.clock();

    const expiresAt =
      new Date(
        parseTimestampMs(
          issuedAt,
        ) +
          input.ttlMs,
      ).toISOString();

    const claims =
      RuntimeAgentSessionClaimsSchema.parse({
        version: 1,
        sessionId:
          this.sessionIdFactory(),

        actor: {
          kind: 'agent',
          id:
            profile.agentId,
        },

        agentId:
          profile.agentId,

        departmentId:
          profile.departmentId,

        capabilities: [
          'agent.runtime.execute',
          'agent.tools.read',
          'brain.read',
          'brain.retrieve',
        ],

        profileDigest:
          digestCompanyAgentRuntimeProfile(
            profile,
          ),

        issuedAt,
        expiresAt,

        issuedBy:
          'company-control-plane',
      });

    const encodedPayload =
      encodeBase64Url(
        JSON.stringify(
          claims,
        ),
      );

    const signature =
      createHmac(
        'sha256',
        this.secret,
      )
        .update(
          encodedPayload,
          'utf8',
        )
        .digest();

    return {
      token:
        `${encodedPayload}.${encodeBase64Url(signature)}`,
      claims,
    };
  }

  verifyAgentSession(input: {
    token: string;
    expectedProfile:
      CompanyAgentRuntimeProfile;
    now?: string;
  }): RuntimeAgentSessionClaims {
    const parts =
      input.token.split('.');

    if (
      parts.length !== 2
    ) {
      throw new Error(
        'runtime_identity_invalid_token_format',
      );
    }

    const [
      encodedPayload,
      encodedSignature,
    ] = parts;

    let providedSignature:
      Buffer;

    try {
      providedSignature =
        Buffer.from(
          encodedSignature,
          'base64url',
        );
    } catch {
      throw new Error(
        'runtime_identity_invalid_signature_encoding',
      );
    }

    const expectedSignature =
      createHmac(
        'sha256',
        this.secret,
      )
        .update(
          encodedPayload,
          'utf8',
        )
        .digest();

    if (
      providedSignature.length !==
        expectedSignature.length ||
      !timingSafeEqual(
        providedSignature,
        expectedSignature,
      )
    ) {
      throw new Error(
        'runtime_identity_signature_invalid',
      );
    }

    let decoded:
      unknown;

    try {
      decoded =
        JSON.parse(
          Buffer.from(
            encodedPayload,
            'base64url',
          ).toString(
            'utf8',
          ),
        );
    } catch {
      throw new Error(
        'runtime_identity_payload_invalid',
      );
    }

    const claims =
      RuntimeAgentSessionClaimsSchema.parse(
        decoded,
      );

    const profile =
      CompanyAgentRuntimeProfileSchema.parse(
        input.expectedProfile,
      );

    if (
      claims.agentId !==
        profile.agentId ||
      claims.actor.id !==
        profile.agentId ||
      claims.departmentId !==
        profile.departmentId
    ) {
      throw new Error(
        `runtime_identity_agent_mismatch:${profile.agentId}`,
      );
    }

    const expectedDigest =
      digestCompanyAgentRuntimeProfile(
        profile,
      );

    if (
      claims.profileDigest !==
      expectedDigest
    ) {
      throw new Error(
        `runtime_identity_profile_changed:${profile.agentId}`,
      );
    }

    const now =
      input.now ??
      this.clock();

    const nowMs =
      parseTimestampMs(
        now,
      );

    const issuedAtMs =
      parseTimestampMs(
        claims.issuedAt,
      );

    const expiresAtMs =
      parseTimestampMs(
        claims.expiresAt,
      );

    if (
      expiresAtMs <=
      issuedAtMs
    ) {
      throw new Error(
        'runtime_identity_invalid_validity_window',
      );
    }

    if (
      nowMs <
      issuedAtMs
    ) {
      throw new Error(
        'runtime_identity_not_yet_valid',
      );
    }

    if (
      nowMs >=
      expiresAtMs
    ) {
      throw new Error(
        'runtime_identity_expired',
      );
    }

    return claims;
  }
}
