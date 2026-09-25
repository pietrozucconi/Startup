import {
  NextResponse,
} from 'next/server';

import {
  buildInfrastructureHealthSnapshot,
} from '@/lib/control-plane/infrastructure-health';


export const dynamic =
  'force-dynamic';


export async function GET() {
  const snapshot =
    await buildInfrastructureHealthSnapshot();


  return NextResponse.json(
    snapshot,
    {
      headers: {
        'cache-control':
          'no-store',
      },
    },
  );
}