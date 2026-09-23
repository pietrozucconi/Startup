import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  buildOmniRouteRuntimeBundle,
} from '@/lib/control-plane/omniroute-runtime-bundle';


describe(
  'OmniRoute runtime bundle',
  () => {
    test(
      'requires an explicit manually supplied model',
      () => {
        expect(
          () =>
            buildOmniRouteRuntimeBundle({
              model:
                '   ',

              env: {
                OMNIROUTE_API_KEY:
                  'test-key',

                OMNIROUTE_BASE_URL:
                  'http://localhost:20128/v1',
              },
            }),
        ).toThrow(
          'omniroute_runtime_model_assignment_required',
        );
      },
    );


    test(
      'builds the runtime around the explicitly assigned model',
      () => {
        const bundle =
          buildOmniRouteRuntimeBundle({
            model:
              'groq/openai/gpt-oss-120b',

            env: {
              OMNIROUTE_API_KEY:
                'test-key',

              OMNIROUTE_BASE_URL:
                'http://localhost:20128/v1',
            },
          });


        expect(
          bundle.model,
        ).toBe(
          'groq/openai/gpt-oss-120b',
        );


        expect(
          bundle.modelAdapter.id,
        ).toBe(
          'omniroute-openai-compatible',
        );


        expect(
          bundle.toolRegistry
            .listForCapabilities([
              'web-research',
              'market-data',
            ]),
        ).toEqual(
          [],
        );
      },
    );
  },
);