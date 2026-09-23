import {
  NextResponse,
} from 'next/server';

import {
  listOmniRouteSelectableModels,
} from '@/lib/control-plane/omniroute-model-catalog';


export const dynamic =
  'force-dynamic';


export async function GET() {
  try {
    const models =
      await listOmniRouteSelectableModels();


    return NextResponse.json({
      available:
        true,

      models,
    });
  } catch {
    /*
     * OmniRoute being unavailable is an infrastructure state,
     * not a reason for the whole Startup API to fail.
     *
     * Never expose secret/configuration details here.
     */
    return NextResponse.json({
      available:
        false,

      models:
        [],

      error:
        'omniroute_unavailable',
    });
  }
}