import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import {
  CogneeBrainRetrievalBackend,
} from '@/lib/brain/cognee/cognee-brain-retrieval-backend';

import {
  createEmptyBrainGraph,
} from '@/lib/brain/graph-ops';

import {
  InMemoryBrainAuditStore,
  InMemoryBrainGraphStore,
} from '@/lib/brain/gateway/store';


describe(
  'Brain Gateway with Cognee retrieval',
  () => {
    test(
      'retrieves Cognee memory while keeping BrainGateway authorization and audit',
      async () => {
        const graphStore =
          new InMemoryBrainGraphStore(
            createEmptyBrainGraph(
              'test',
              '2026-01-01T00:00:00.000Z',
            ),
          );


        const auditStore =
          new InMemoryBrainAuditStore();


        const backend =
          new CogneeBrainRetrievalBackend({
            dataset:
              'startup_brain_smoke',

            readableByAgentIds: [
              'lauti',
            ],

            readableByDepartmentIds: [
              'dept-research',
            ],

            client: {
              async recall() {
                return [
                  {
                    kind:
                      'chunk',

                    search_type:
                      'CHUNKS',

                    text:
                      'Startup Brain test memory: Lauti is the Equity Research Desk responsible for listed equity research.',

                    system_prompt:
                      null,

                    score:
                      0.25,

                    dataset_id:
                      'dataset-1',

                    dataset_name:
                      'startup_brain_smoke',

                    metadata:
                      {},

                    raw: {
                      value:
                        'Startup Brain test memory: Lauti is the Equity Research Desk responsible for listed equity research.',
                    },

                    structured:
                      null,

                    source:
                      'graph',
                  },
                ];
              },
            },
          });


        const gateway =
          new BrainGateway(
            graphStore,
            auditStore,
            () =>
              '2026-01-01T01:00:00.000Z',
            backend,
          );


        const result =
          await gateway.read({
            requestId:
              'cognee-read-1',

            principal: {
              actor: {
                kind:
                  'agent',

                id:
                  'lauti',
              },

              departmentIds: [
                'dept-research',
              ],

              capabilities: [
                'brain.read',
                'brain.retrieve',
              ],

              issuedBy:
                'company-control-plane',
            },

            intent:
              'institutional_memory',

            purpose:
              'Retrieve institutional memory for Lauti.',

            query: {
              text:
                'Lauti',

              limit:
                5,
            },

            context: {
              departmentIds: [
                'dept-research',
              ],

              agentIds: [
                'lauti',
              ],
            },

            budget: {
              maxResults:
                5,

              maxHops:
                2,

              maxContentCharsPerNode:
                100_000,

              maxTotalContentChars:
                100_000,

              includeContent:
                true,

              includeMetadata:
                true,
            },
          });


        expect(
          result.results,
        ).toHaveLength(
          1,
        );


        expect(
          result.results[0]
            ?.node.content,
        ).toContain(
          'Equity Research Desk',
        );


        expect(
          result.results[0]
            ?.node.id,
        ).toContain(
          'cognee:',
        );


        const audit =
          await auditStore
            .list();


        expect(
          audit,
        ).toHaveLength(
          1,
        );


        expect(
          audit[0]
            ?.metadata
            ?.retrievalBackend,
        ).toBe(
          'cognee-http-retrieval',
        );
      },
    );


    test(
      'still denies Cognee memory outside its governed read scope',
      async () => {
        const graphStore =
          new InMemoryBrainGraphStore(
            createEmptyBrainGraph(
              'test',
              '2026-01-01T00:00:00.000Z',
            ),
          );


        const auditStore =
          new InMemoryBrainAuditStore();


        const backend =
          new CogneeBrainRetrievalBackend({
            dataset:
              'startup_brain_smoke',

            readableByAgentIds: [
              'lauti',
            ],

            client: {
              async recall() {
                return [
                  {
                    kind:
                      'chunk',

                    search_type:
                      'CHUNKS',

                    text:
                      'Private Lauti memory.',

                    system_prompt:
                      null,

                    score:
                      null,

                    dataset_id:
                      'dataset-1',

                    dataset_name:
                      'startup_brain_smoke',

                    metadata:
                      {},

                    raw:
                      {},

                    structured:
                      null,

                    source:
                      'graph',
                  },
                ];
              },
            },
          });


        const gateway =
          new BrainGateway(
            graphStore,
            auditStore,
            undefined,
            backend,
          );


        const result =
          await gateway.read({
            requestId:
              'cognee-read-denied',

            principal: {
              actor: {
                kind:
                  'agent',

                id:
                  'pepo',
              },

              departmentIds: [
                'dept-research',
              ],

              capabilities: [
                'brain.read',
                'brain.retrieve',
              ],

              issuedBy:
                'company-control-plane',
            },

            intent:
              'institutional_memory',

            purpose:
              'Attempt unauthorized memory retrieval.',

            query: {
              text:
                'Lauti',
            },

            context:
              {},

            budget:
              {},
          });


        expect(
          result.results,
        ).toEqual(
          [],
        );
      },
    );
  },
);