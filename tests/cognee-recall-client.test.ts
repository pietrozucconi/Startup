import {
  describe,
  expect,
  test,
  vi,
} from 'vitest';

import {
  CogneeRecallClient,
} from '@/lib/brain/cognee/cognee-recall-client';


describe(
  'CogneeRecallClient',
  () => {
    test(
      'authenticates and performs retrieval-only CHUNKS recall',
      async () => {
        const fetchImpl =
          vi.fn();


        fetchImpl
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                access_token:
                  'test-token',

                token_type:
                  'bearer',
              }),
              {
                status:
                  200,

                headers: {
                  'content-type':
                    'application/json',
                },
              },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify([
                {
                  kind:
                    'chunk',

                  search_type:
                    'CHUNKS',

                  text:
                    'Startup Brain test memory: Lauti is the Equity Research Desk.',

                  system_prompt:
                    null,

                  score:
                    0.2,

                  dataset_id:
                    'dataset-1',

                  dataset_name:
                    'startup_brain_smoke',

                  metadata:
                    {},

                  raw: {
                    value:
                      'Startup Brain test memory: Lauti is the Equity Research Desk.',
                  },

                  structured:
                    null,

                  source:
                    'graph',
                },
              ]),
              {
                status:
                  200,

                headers: {
                  'content-type':
                    'application/json',
                },
              },
            ),
          );


        const client =
          new CogneeRecallClient({
            baseUrl:
              'http://127.0.0.1:8000',

            email:
              'default_user@example.com',

            passwordSecretName:
              'COGNEE_API_PASSWORD',

            secretSource: {
              getSecret(
                name,
              ) {
                expect(
                  name,
                ).toBe(
                  'COGNEE_API_PASSWORD',
                );

                return 'secret';
              },
            },

            fetchImpl:
              fetchImpl as
                unknown as
                typeof fetch,
          });


        const result =
          await client.recall({
            query:
              'Lauti',

            dataset:
              'startup_brain_smoke',

            topK:
              5,
          });


        expect(
          result,
        ).toHaveLength(
          1,
        );


        expect(
          result[0]?.text,
        ).toContain(
          'Lauti',
        );


        expect(
          fetchImpl,
        ).toHaveBeenCalledTimes(
          2,
        );


        const recallCall =
          fetchImpl.mock
            .calls[1];


        const recallUrl =
          recallCall?.[0];


        const recallInit =
          recallCall?.[1] as
            RequestInit;


        expect(
          recallUrl,
        ).toBe(
          'http://127.0.0.1:8000/api/v1/recall',
        );


        expect(
          recallInit.headers,
        ).toMatchObject({
          authorization:
            'Bearer test-token',
        });


        expect(
          JSON.parse(
            String(
              recallInit.body,
            ),
          ),
        ).toEqual({
          query:
            'Lauti',

          datasets: [
            'startup_brain_smoke',
          ],

          searchType:
            'CHUNKS',

          topK:
            5,

          onlyContext:
            true,

          scope:
            'graph',
        });
      },
    );


    test(
      'refreshes authentication once after a 401',
      async () => {
        const fetchImpl =
          vi.fn()
            .mockResolvedValueOnce(
              new Response(
                JSON.stringify({
                  access_token:
                    'token-1',

                  token_type:
                    'bearer',
                }),
                {
                  status:
                    200,
                },
              ),
            )
            .mockResolvedValueOnce(
              new Response(
                '',
                {
                  status:
                    401,
                },
              ),
            )
            .mockResolvedValueOnce(
              new Response(
                JSON.stringify({
                  access_token:
                    'token-2',

                  token_type:
                    'bearer',
                }),
                {
                  status:
                    200,
                },
              ),
            )
            .mockResolvedValueOnce(
              new Response(
                JSON.stringify([]),
                {
                  status:
                    200,
                },
              ),
            );


        const client =
          new CogneeRecallClient({
            baseUrl:
              'http://127.0.0.1:8000',

            email:
              'default_user@example.com',

            passwordSecretName:
              'COGNEE_API_PASSWORD',

            secretSource: {
              getSecret() {
                return 'secret';
              },
            },

            fetchImpl:
              fetchImpl as
                unknown as
                typeof fetch,
          });


        const result =
          await client.recall({
            query:
              'Lauti',

            dataset:
              'startup_brain_smoke',

            topK:
              5,
          });


        expect(
          result,
        ).toEqual(
          [],
        );


        expect(
          fetchImpl,
        ).toHaveBeenCalledTimes(
          4,
        );
      },
    );
  },
);