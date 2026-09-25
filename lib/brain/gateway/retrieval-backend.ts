import type {
  BrainReadRequest,
} from '@/lib/brain/gateway/schema';

import type {
  BrainRetrievalResult,
} from '@/lib/brain/retrieval';


export interface BrainRetrievalBackend {
  readonly id:
    string;

  retrieve(input: {
    request:
      BrainReadRequest;

    now:
      string;
  }): Promise<
    BrainRetrievalResult[]
  >;
}