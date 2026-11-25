# Demo deploy

The demo Worker deploys with Wrangler, not with the Rat Stack path. That path needs a Secrets Store permission. This project does not hold it. So the demo deploy skips it on purpose.

## Environment

The host comes from `PECUNIA_DEMO_HOST`. The account comes from `CLOUDFLARE_ACCOUNT_ID`. Wrangler reads both variables from the environment. The config file holds no host and no zone.

## Dry run first

Run the dry run and read the output.

```sh
npx wrangler@4 deploy -c apps/web/wrangler.demo.jsonc --dry-run
```

## Deploy

`--domain` sets a custom domain from the command line. Wrangler `4.158.0` provides it. Check yours with `wrangler deploy --help`.

```sh
PECUNIA_DEMO_HOST=demo.example.test \
  CLOUDFLARE_ACCOUNT_ID=0000000000000000 \
  npx wrangler@4 deploy -c apps/web/wrangler.demo.jsonc --domain "$PECUNIA_DEMO_HOST"
```

Swap the placeholder host for yours. Never commit a real host. `apps/web/wrangler.demo.jsonc` keeps assets, name and settings only.
