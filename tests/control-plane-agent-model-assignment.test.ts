import {
  afterEach,
  describe,
  expect,
  test,
} from 'vitest';

import {
  openDb,
  type FounderDb,
} from '@/lib/db';

import {
  assignAgentModel,
} from '@/lib/control-plane/agent-model-assignment';


let db:
  FounderDb;


afterEach(
  () => {
    db?.close();
  },
);


function createTestAgent() {
  db.departments.insert({
    id:
      'dept-research',

    name:
      'Research',

    slug:
      'research',

    tagline:
      '',

    color:
      '#fff',

    order:
      1,
  });


  db.agents.insert({
    id:
      'lauti',

    departmentId:
      'dept-research',

    name:
      'Lauti',

    role:
      'Equity Research Desk',

    status:
      'planned',

    tier:
      'worker',

    description:
      '',

    model:
      'unassigned',

    tools:
      [],

    parentId:
      null,

    instance:
      'builtin',
  });
}


function catalogFetch():
  typeof fetch {
  return async () =>
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

          {
            id:
              'auto/best-free',

            object:
              'model',

            type:
              'chat',
          },

          {
            id:
              'combo/research',

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
    );
}


describe(
  'CEO manual model assignment',
  () => {
    test(
      'CEO assigns an exact OmniRoute model and audit history is created',
      async () => {
        db =
          openDb(
            ':memory:',
          );


        createTestAgent();


        const result =
          await assignAgentModel({
            db,

            principal: {
              actor: {
                kind:
                  'human',

                id:
                  'ceo',
              },
            },

            agentId:
              'lauti',

            model:
              'groq/openai/gpt-oss-120b',

            env: {
              OMNIROUTE_API_KEY:
                'test-key',

              OMNIROUTE_BASE_URL:
                'http://localhost:20128/v1',
            },

            fetchImpl:
              catalogFetch(),

            clock:
              () =>
                '2026-09-22T21:00:00.000Z',

            idFactory:
              () =>
                'test-1',
          });


        expect(
          result.changed,
        ).toBe(
          true,
        );


        expect(
          db.agents
            .byId(
              'lauti',
            )
            ?.model,
        ).toBe(
          'groq/openai/gpt-oss-120b',
        );


        expect(
          db.agentModelAssignments
            .byAgent(
              'lauti',
            ),
        ).toEqual([
          {
            id:
              'agent-model-assignment:test-1',

            agentId:
              'lauti',

            previousModel:
              'unassigned',

            assignedModel:
              'groq/openai/gpt-oss-120b',

            assignedBy:
              'ceo',

            assignedAt:
              '2026-09-22T21:00:00.000Z',
          },
        ]);
      },
    );


    test(
      'an agent cannot assign its own model',
      async () => {
        db =
          openDb(
            ':memory:',
          );


        createTestAgent();


        await expect(
          assignAgentModel({
            db,

            principal: {
              actor: {
                kind:
                  'agent',

                id:
                  'lauti',
              },
            },

            agentId:
              'lauti',

            model:
              'groq/openai/gpt-oss-120b',

            fetchImpl:
              catalogFetch(),
          }),
        ).rejects.toThrow(
          'ceo_required_for_model_assignment',
        );


        expect(
          db.agents
            .byId(
              'lauti',
            )
            ?.model,
        ).toBe(
          'unassigned',
        );
      },
    );


    test(
      'automatic routing cannot be assigned to an employee',
      async () => {
        db =
          openDb(
            ':memory:',
          );


        createTestAgent();


        await expect(
          assignAgentModel({
            db,

            principal: {
              actor: {
                kind:
                  'human',

                id:
                  'ceo',
              },
            },

            agentId:
              'lauti',

            model:
              'auto/best-free',

            fetchImpl:
              catalogFetch(),
          }),
        ).rejects.toThrow(
          'automatic_model_routing_forbidden',
        );


        expect(
          db.agents
            .byId(
              'lauti',
            )
            ?.model,
        ).toBe(
          'unassigned',
        );
      },
    );
  },
);