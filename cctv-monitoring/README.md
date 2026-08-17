# Store Monitoring — Report Site

Static site with the final architecture report (`index.html`) for the 2,000-store CCTV monitoring system. Costing is kept as a separate document, not published here.

## Deploy to Fly.io

### Option A — GitHub Actions (recommended)

A workflow at `.github/workflows/fly-deploy.yml` deploys this site automatically.
One-time setup:

1. Get a Fly API token: [fly.io dashboard → Tokens](https://fly.io/user/personal_access_tokens) or `fly tokens create deploy`.
2. Add it as a repo secret named `FLY_API_TOKEN` (GitHub → Settings → Secrets and variables → Actions).
3. Run the workflow (Actions tab → "Deploy report site to Fly" → Run workflow), or push any change under `cctv-monitoring/`.

Site comes up at `https://store-monitoring-pmis.fly.dev`. If that app name is taken, change `app` in `fly.toml` and the app name in the workflow.

### Option B — local flyctl

From this directory (`cctv-monitoring/`), with [flyctl](https://fly.io/docs/flyctl/install/) installed:

```sh
fly auth login
fly launch --copy-config --name <your-app-name> --region bom --now
```

Subsequent updates: `fly deploy`.

The site is served by nginx; no server-side code. `bom` = Mumbai region — change if needed.
