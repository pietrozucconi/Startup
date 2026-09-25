import {
  createHash,
} from 'node:crypto';

import {
  BrainGraphNodeSchema,
  type BrainGraphNodeType,
} from '@/lib/brain/graph-schema';

import type {
  BrainRetrievalBackend,
} from '@/lib/brain/gateway/retrieval-backend';

import type {
  BrainRetrievalResult,
} from '@/lib/brain/retrieval';

import type {
  CogneeRecallClient,
  CogneeRecallItem,
} from '@/lib/brain/cognee/cognee-recall-client';


function clip(
  value:
    string,

  max:
    number,
): string {
  if (
    value.length <=
    max
  ) {
    return value;
  }

  return `${value.slice(
    0,
    Math.max(
      0,
      max - 1,
    ),
  )}…`;
}


function optionalString(
  value:
    unknown,
): string | null {
  return (
    typeof value ===
      'string' &&
    value.trim()
  )
    ? value.trim()
    : null;
}


function sourceIdentifier(
  item:
    CogneeRecallItem,
): string {
  const rawId =
    optionalString(
      item.raw.id,
    );

  const metadataChunkId =
    optionalString(
      item.metadata
        .chunk_id,
    );

  const metadataId =
    optionalString(
      item.metadata.id,
    );

  if (
    rawId
  ) {
    return rawId;
  }

  if (
    metadataChunkId
  ) {
    return metadataChunkId;
  }

  if (
    metadataId
  ) {
    return metadataId;
  }

  return createHash(
    'sha256',
  )
    .update(
      item.text,
    )
    .digest(
      'hex',
    )
    .slice(
      0,
      32,
    );
}


function normalizedScore(
  score:
    number |
    null |
    undefined,
): number {
  if (
    score ===
      null ||
    score ===
      undefined ||
    !Number.isFinite(
      score,
    ) ||
    score < 0
  ) {
    return 0.5;
  }

  /*
   * Cognee CHUNKS commonly exposes
   * distance-like scores where lower
   * values are better.
   */
  return 1 /
    (
      1 +
      score
    );
}


export class CogneeBrainRetrievalBackend
  implements BrainRetrievalBackend
{
  readonly id =
    'cognee-http-retrieval';


  constructor(
    private readonly input: {
      client:
        Pick<
          CogneeRecallClient,
          'recall'
        >;

      dataset:
        string;

      nodeType?:
        BrainGraphNodeType;

      readableByAgentIds?:
        string[];

      readableByDepartmentIds?:
        string[];
    },
  ) {}


  async retrieve({
    request,
  }: Parameters<
    BrainRetrievalBackend['retrieve']
  >[0]): Promise<
    BrainRetrievalResult[]
  > {
    const nodeType =
      this.input
        .nodeType ??
      'source';


    const requestedNodeTypes =
      request
        .requestedNodeTypes
        .length >
      0
        ? request
            .requestedNodeTypes
        : request.query
            .nodeTypes;


    if (
      requestedNodeTypes.length >
        0 &&
      !requestedNodeTypes.includes(
        nodeType,
      )
    ) {
      return [];
    }


    /*
     * A generic Cognee chunk does not
     * carry these typed Startup Brain
     * semantics yet. Do not pretend
     * that it satisfies such filters.
     */
    if (
      request.query
        .memorySystems
        .length >
        0 ||
      request.query
        .epistemicKinds
        .length >
        0 ||
      request.query
        .minConfidence !==
        undefined
    ) {
      return [];
    }


    const topK =
      Math.min(
        request.query
          .limit,

        request.budget
          .maxResults,
      );


    const items =
      await this.input
        .client
        .recall({
          query:
            request.query
              .text,

          dataset:
            this.input
              .dataset,

          topK,
        });


    return items.map(
      (
        item,
      ) =>
        this.toResult(
          item,
          nodeType,
          request.context,
        ),
    );
  }


  private toResult(
    item:
      CogneeRecallItem,

    nodeType:
      BrainGraphNodeType,

    context:
      Parameters<
        BrainRetrievalBackend[
          'retrieve'
        ]
      >[0]['request']['context'],
  ): BrainRetrievalResult {
    const score =
      normalizedScore(
        item.score,
      );


    const sourceId =
      sourceIdentifier(
        item,
      );


    const datasetIdentity =
      item.dataset_id ??
      item.dataset_name ??
      this.input.dataset;


    const node =
      BrainGraphNodeSchema.parse({
        id:
          `cognee:${datasetIdentity}:${sourceId}`,

        type:
          nodeType,

        label:
          item.text.trim()
            ? `Cognee memory: ${clip(
                item.text.trim(),
                100,
              )}`
            : 'Cognee memory',

        summary:
          clip(
            item.text,
            500,
          ),

        content:
          item.text,

        rationaleSummary:
          '',

        status:
          'active',

        tags: [
          'cognee',
          'institutional-memory',
        ],

        keywords:
          [],

        context,

        governance: {
          visibility:
            'internal',

          readableByAgentIds:
            this.input
              .readableByAgentIds ??
            [],

          readableByDepartmentIds:
            this.input
              .readableByDepartmentIds ??
            [],

          writableByAgentIds:
            [],

          writableByDepartmentIds:
            [],

          humanApprovalRequired:
            false,

          immutable:
            false,

          legalHold:
            false,
        },

        audit:
          {},

        version:
          1,

        metadata: {
          backend:
            this.id,

          cognee: {
            datasetId:
              item.dataset_id,

            datasetName:
              item.dataset_name,

            source:
              item.source,

            kind:
              item.kind,

            searchType:
              item.search_type,

            metadata:
              item.metadata,
          },
        },
      });


    return {
      node,

      score,

      breakdown: {
        text:
          score,

        salience:
          0,

        activation:
          0,

        confidence:
          0,

        retention:
          0,

        recency:
          0,

        graphProximity:
          0,
      },

      reasons: [
        'cognee_chunk_retrieval',
      ],
    };
  }
}