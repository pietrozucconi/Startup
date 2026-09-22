import {
  createHash,
} from 'node:crypto';

/**
 * Fields that are transport/runtime metadata rather than the semantic intent
 * of a Control Plane request.
 *
 * They are intentionally excluded so a legitimate retry can use:
 * - a new optimistic expectedRevision;
 * - a new trusted session;
 * - runtime-generated timestamps;
 *
 * without changing the semantic request fingerprint.
 */
const NON_SEMANTIC_KEYS = new Set([
  'requestId',
  'expectedRevision',
  'sessionId',
  'createdAt',
  'updatedAt',
  'recordedAt',
  'resolvedAt',
  'executionRecordedAt',
]);

function canonicalize(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (
    typeof value === 'number'
  ) {
    if (!Number.isFinite(value)) {
      throw new Error(
        'request_fingerprint_non_finite_number',
      );
    }

    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    typeof value === 'object'
  ) {
    const record =
      value as Record<
        string,
        unknown
      >;

    const normalized:
      Record<string, unknown> = {};

    for (
      const key of Object.keys(
        record,
      ).sort()
    ) {
      if (
        NON_SEMANTIC_KEYS.has(
          key,
        )
      ) {
        continue;
      }

      const child =
        record[key];

      if (
        child === undefined
      ) {
        continue;
      }

      normalized[key] =
        canonicalize(child);
    }

    return normalized;
  }

  if (
    value === undefined
  ) {
    return null;
  }

  throw new Error(
    `request_fingerprint_unsupported_type:${typeof value}`,
  );
}

export function canonicalizeControlPlaneRequest(
  request: unknown,
): string {
  return JSON.stringify(
    canonicalize(request),
  );
}

export function fingerprintControlPlaneRequest(
  request: unknown,
): string {
  const canonical =
    canonicalizeControlPlaneRequest(
      request,
    );

  const digest =
    createHash('sha256')
      .update(
        canonical,
        'utf8',
      )
      .digest('hex');

  return `sha256:${digest}`;
}
