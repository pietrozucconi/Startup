import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  listOmniRouteSelectableModels,
} from '@/lib/control-plane/omniroute-model-catalog';


describe(
  'OmniRoute model catalog',
  () => {
    test(
      'returns exact manually selectable canonical models only',
      async () => {
        const requests:
          Array<{
            url:
              string;

            init?:
              RequestInit;
          }> = [];


        const fetchImpl:
          typeof fetch =
          async (
            url,
            init,
          ) => {
            requests.push({
              url:
                String(
                  url,
                ),

              init,
            });


            return new Response(
              JSON.stringify({
                data: [
                  {
                    id:
                      'groq/openai/gpt-oss-120b',

                    object:
                      'model',

                    type:
                      'chat',
                  },

                  {
                    id:
                      'groq/qwen/qwen3-32b',

                    object:
                      'model',
                  },

                  {
                    id:
                      'auto/free',

                    object:
                      'model',
                  },

                  {
                    id:
                      'combo/research-best',

                    object:
                      'model',
                  },

                  {
                    id:
                      'groq/some-embedding-model',

                    object:
                      'model',

                    type:
                      'embedding',
                  },

                  {
                    id:
                      'groq/openai/gpt-oss-120b',

                    object:
                      'model',
                  },
                ],
              }),
              {
                status:
                  200,

                headers: {
                  'content-type':
                    'application/json',
                },
              },
            );
          };


        const models =
          await listOmniRouteSelectableModels({
            env: {
              OMNIROUTE_API_KEY:
                'test-key',

              OMNIROUTE_BASE_URL:
                'http://localhost:20128/v1',
            },

            fetchImpl,
          });


        expect(
          models,
        ).toEqual([
          {
            id:
              'groq/openai/gpt-oss-120b',

            provider:
              'groq',
          },

          {
            id:
              'groq/qwen/qwen3-32b',

            provider:
              'groq',
          },
        ]);


        expect(
          requests,
        ).toHaveLength(
          1,
        );


        expect(
          requests[0].url,
        ).toBe(
          'http://localhost:20128/v1/models?prefix=alias',
        );


        const headers =
          new Headers(
            requests[0]
              .init
              ?.headers,
          );


        expect(
          headers.get(
            'authorization',
          ),
        ).toBe(
          'Bearer test-key',
        );
      },
    );
  },
);