// Code samples used across the portal (Overview, Quickstart, Webhooks).

export const QUICKSTART_INSTALL = {
  ts: { file: 'terminal', lang: 'bash', code: 'npm install @thesauros/sdk\n# or\npnpm add @thesauros/sdk' },
  python: { file: 'terminal', lang: 'bash', code: 'pip install thesauros' },
  curl: { file: 'terminal', lang: 'bash', code: '# No install needed \u2014 the API is plain HTTPS + JSON.' },
};

export const QUICKSTART_INIT = {
  ts: {
    file: 'client.ts',
    lang: 'typescript',
    code: `import { Thesauros } from '@thesauros/sdk';

const client = new Thesauros({
  apiKey: process.env.THESAUROS_API_KEY, // tsk_test_\u2026 or tsk_live_\u2026
});`,
  },
  python: {
    file: 'client.py',
    lang: 'python',
    code: `import os
from thesauros import Thesauros

client = Thesauros(api_key=os.environ["THESAUROS_API_KEY"])`,
  },
  curl: {
    file: 'terminal',
    lang: 'bash',
    code: `export THESAUROS_API_KEY="tsk_test_\u2026"
export THESAUROS_BASE="https://developer.thesauros.io/api/v1"`,
  },
};

export const QUICKSTART_DEPOSIT = {
  ts: {
    file: 'earn.ts',
    lang: 'typescript',
    code: `// Open a non-custodial yield position from your user's wallet
const position = await client.positions.create({
  wallet: user.address,
  asset: 'USDC',
  amount: 1000,
});

console.log(position.id);      // "pos_9f2c\u2026"
console.log(position.status);  // "active"
console.log(position.apy);     // 6.42`,
  },
  python: {
    file: 'earn.py',
    lang: 'python',
    code: `# Open a non-custodial yield position from your user's wallet
position = client.positions.create(
    wallet=user_address,
    asset="USDC",
    amount=1000,
)

print(position["id"])      # "pos_9f2c\u2026"
print(position["status"])  # "active"
print(position["apy"])     # 6.42`,
  },
  curl: {
    file: 'terminal',
    lang: 'bash',
    code: `curl -X POST "$THESAUROS_BASE/positions" \\
  -H "Authorization: Bearer $THESAUROS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "wallet": "0x8b3E5f2A91cD4b6E80fA2d19c7B4e3A5d0F61234",
    "asset": "USDC",
    "amount": 1000
  }'`,
  },
};

export const QUICKSTART_MONITOR = {
  ts: {
    file: 'monitor.ts',
    lang: 'typescript',
    code: `// Track live value + accrued yield
const pos = await client.positions.retrieve(position.id);
console.log(pos.current_value);  // 1000.18 \u2014 accrues continuously
console.log(pos.accrued_yield);  // 0.18

// Every routing decision is observable
const rebalances = await client.rebalances.list({ position_id: position.id });`,
  },
  python: {
    file: 'monitor.py',
    lang: 'python',
    code: `# Track live value + accrued yield
pos = client.positions.retrieve(position["id"])
print(pos["current_value"])  # 1000.18 \u2014 accrues continuously
print(pos["accrued_yield"])  # 0.18

# Every routing decision is observable
rebalances = client.rebalances.list(position_id=position["id"])`,
  },
  curl: {
    file: 'terminal',
    lang: 'bash',
    code: `curl "$THESAUROS_BASE/positions/pos_9f2c" \\
  -H "Authorization: Bearer $THESAUROS_API_KEY"`,
  },
};

export const WEBHOOK_VERIFY = {
  ts: {
    file: 'webhook-handler.ts',
    lang: 'typescript',
    code: `import { verifyWebhookSignature } from '@thesauros/sdk';

app.post('/webhooks/thesauros', express.raw({ type: 'application/json' }), async (req, res) => {
  const header = req.headers['webhook-signature'] as string;
  const valid = await verifyWebhookSignature(WH_SECRET, header, req.body);
  if (!valid) return res.status(400).send('bad signature');

  const event = JSON.parse(req.body.toString());
  switch (event.type) {
    case 'position.rebalanced':
      // notify your user, update your ledger\u2026
      break;
  }
  res.status(200).end();
});`,
  },
  python: {
    file: 'webhook_handler.py',
    lang: 'python',
    code: `from thesauros.webhooks import verify_signature

@app.post("/webhooks/thesauros")
async def thesauros_hook(request: Request):
    body = await request.body()
    header = request.headers.get("webhook-signature", "")
    if not verify_signature(WH_SECRET, header, body):
        return Response(status_code=400)

    event = json.loads(body)
    if event["type"] == "position.rebalanced":
        ...  # notify your user, update your ledger\u2026
    return Response(status_code=200)`,
  },
  curl: {
    file: 'signature',
    lang: 'bash',
    code: `# Webhook-Signature header format:
#   t=<unix_ts>,v1=<hmac_sha256_hex>
#
# v1 = HMAC_SHA256(secret, "<t>.<raw_body>")
#
# Verify with constant-time comparison. Reject stale t (\u00b15 min).`,
  },
};

// The live "hero" request shown on Overview.
export const OVERVIEW_REQUEST = {
  file: 'sandbox \u2014 live request',
  lang: 'http',
  code: `GET /api/v1/yield/USDC HTTP/1.1
Host: developer.thesauros.io
Authorization: Bearer tsk_test_\u2026\u00b7\u00b7\u00b7
Accept: application/json`,
};
