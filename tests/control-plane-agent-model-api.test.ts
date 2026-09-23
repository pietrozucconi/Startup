import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

import {
  mkdtempSync,
} from 'node:fs';

import {
  tmpdir,
} from 'node:os';

import path from 'node:path';


beforeAll(
  () => {
    process.env.STARTUP_DB =
      path.join(
        mkdtempSync(
          path.join(
            tmpdir(),
            'startup-model-api-',
          ),
        ),
        'test.db',
      );


    process.env.OMNIROUTE_API_KEY =
      'test-key';


    process.env.OMNIROUTE_BASE_URL =
      'http://localhost:20128/v1';


    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
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
        ),
    );
  },
);


afterAll(
  () => {
    vi.unstubAllGlobals();
  },
);


describe(
  'agent model assignment API',
  () => {
    test(
      'CEO operator endpoint persists a manual model assignment',
      async () => {
        const {
          POST,
        } =
          await import(
            '@/app/api/agents/[id]/model/route'
          );


        const response =
          await POST(
            new Request(
              'http://localhost/api/agents/lauti/model',
              {
                method:
                  'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    model:
                      'groq/openai/gpt-oss-120b',
                  }),
              },
            ),

            {
              params: {
                id:
                  'lauti',
              },
            },
          );


        expect(
          response.status,
        ).toBe(
          200,
        );


        const body =
          await response.json();


        expect(
          body.ok,
        ).toBe(
          true,
        );


        expect(
          body.agent.model,
        ).toBe(
          'groq/openai/gpt-oss-120b',
        );


        const {
          getDb,
        } =
          await import(
            '@/lib/data'
          );


        expect(
          getDb()
            .agents
            .byId(
              'lauti',
            )
            ?.model,
        ).toBe(
          'groq/openai/gpt-oss-120b',
        );


        expect(
          getDb()
            .agentModelAssignments
            .byAgent(
              'lauti',
            ),
        ).toHaveLength(
          1,
        );
      },
    );
  },
);