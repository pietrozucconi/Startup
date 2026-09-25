import { z } from 'zod';

import type {
  RuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';


const CogneeLoginResponseSchema =
  z.object({
    access_token:
      z.string().min(1),

    token_type:
      z.string().min(1),
  });


export const CogneeRecallItemSchema =
  z.object({
    kind:
      z.string().min(1),

    search_type:
      z.string().min(1),

    text:
      z.string(),

    system_prompt:
      z.string()
        .nullable()
        .optional(),

    score:
      z.number()
        .nullable()
        .optional(),

    dataset_id:
      z.string()
        .nullable()
        .optional(),

    dataset_name:
      z.string()
        .nullable()
        .optional(),

    metadata:
      z.record(
        z.unknown(),
      )
        .default({}),

    raw:
      z.record(
        z.unknown(),
      )
        .default({}),

    structured:
      z.unknown()
        .nullable()
        .optional(),

    source:
      z.string().min(1),
  });


export type CogneeRecallItem =
  z.infer<
    typeof CogneeRecallItemSchema
  >;


function normalizeBaseUrl(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\/+$/,
      '',
    );
}


async function safeErrorText(
  response:
    Response,
): Promise<string> {
  try {
    const text =
      await response.text();

    return text
      .slice(
        0,
        1_000,
      );
  } catch {
    return '';
  }
}


export class CogneeRecallClient {
  private accessToken:
    string |
    null =
    null;


  constructor(
    private readonly input: {
      baseUrl:
        string;

      email:
        string;

      passwordSecretName:
        string;

      secretSource:
        RuntimeSecretSource;

      fetchImpl?:
        typeof fetch;
    },
  ) {}


  private get fetchImpl():
    typeof fetch {
    return (
      this.input
        .fetchImpl ??
      globalThis.fetch
    );
  }


  private get baseUrl():
    string {
    return normalizeBaseUrl(
      this.input.baseUrl,
    );
  }


  private async login():
    Promise<string> {
    const password =
      this.input
        .secretSource
        .getSecret(
          this.input
            .passwordSecretName,
        );


    const body =
      new URLSearchParams({
        username:
          this.input.email,

        password,
      });


    const response =
      await this.fetchImpl(
        `${this.baseUrl}/api/v1/auth/login`,
        {
          method:
            'POST',

          headers: {
            'content-type':
              'application/x-www-form-urlencoded',
          },

          body:
            body.toString(),
        },
      );


    if (
      !response.ok
    ) {
      throw new Error(
        [
          'cognee_login_failed',
          `status=${response.status}`,
          await safeErrorText(
            response,
          ),
        ].join(
          ':',
        ),
      );
    }


    const parsed =
      CogneeLoginResponseSchema
        .parse(
          await response.json(),
        );


    this.accessToken =
      parsed.access_token;


    return this.accessToken;
  }


  private async token():
    Promise<string> {
    if (
      this.accessToken
    ) {
      return this.accessToken;
    }


    return this.login();
  }


  private async recallRequest(
    input: {
      query:
        string;

      dataset:
        string;

      topK:
        number;
    },

    token:
      string,
  ): Promise<Response> {
    return this.fetchImpl(
      `${this.baseUrl}/api/v1/recall`,
      {
        method:
          'POST',

        headers: {
          authorization:
            `Bearer ${token}`,

          'content-type':
            'application/json',
        },

        body:
          JSON.stringify({
            query:
              input.query,

            datasets: [
              input.dataset,
            ],

            searchType:
              'CHUNKS',

            topK:
              input.topK,

            onlyContext:
              true,

            scope:
              'graph',
          }),
      },
    );
  }


  async recall(
    input: {
      query:
        string;

      dataset:
        string;

      topK:
        number;
    },
  ): Promise<
    CogneeRecallItem[]
  > {
    let token =
      await this.token();


    let response =
      await this.recallRequest(
        input,
        token,
      );


    /*
     * A Cognee server restart can invalidate
     * a previously issued JWT. Refresh once
     * transparently, but never loop forever.
     */
    if (
      response.status ===
      401
    ) {
      this.accessToken =
        null;

      token =
        await this.login();

      response =
        await this.recallRequest(
          input,
          token,
        );
    }


    if (
      !response.ok
    ) {
      throw new Error(
        [
          'cognee_recall_failed',
          `status=${response.status}`,
          await safeErrorText(
            response,
          ),
        ].join(
          ':',
        ),
      );
    }


    const raw =
      await response.json();


    /*
     * Cognee's HTTP contract is a list.
     * PowerShell visually unwraps a
     * one-element list, so we accept both
     * shapes defensively.
     */
    const values =
      Array.isArray(
        raw,
      )
        ? raw
        : [
            raw,
          ];


    return values.map(
      (
        item,
      ) =>
        CogneeRecallItemSchema
          .parse(
            item,
          ),
    );
  }
}