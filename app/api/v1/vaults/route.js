/** GET /api/v1/vaults?asset=&chain=&status= — list vaults. */
import { apiHandler, OPTIONS, paginate } from '../../../../lib/api/http.js';
import { all } from '../../../../lib/api/store.js';

export { OPTIONS };

export const GET = apiHandler({}, async (request, ctx, api) => {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset');
  const chain = searchParams.get('chain');
  const status = searchParams.get('status');

  const vaults = all('vaults').filter(
    (v) =>
      (!asset || v.asset === asset) &&
      (!chain || v.chain === chain) &&
      (!status || v.status === status),
  );
  const page = paginate(request, vaults);
  return api.list(page.items, { meta: page.meta });
});
