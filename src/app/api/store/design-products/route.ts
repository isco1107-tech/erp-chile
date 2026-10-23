import { NextResponse } from 'next/server';
import { previewStoreProductsAction } from '@/modules/ecommerce/actions/store-editor.actions';

/** Authenticated preview; unpublished prices and products never enter a public response. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const result = await previewStoreProductsAction(query.get('siteId') ?? '', {
    collection: query.get('collection') ?? undefined,
    featuredOnly: query.get('featuredOnly') === 'true',
    limit: Number(query.get('limit')) || 8,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 403, headers: { 'Cache-Control': 'private, no-store' } });
}
