# Store Monitoring — Report Site

Static site with the final architecture report (`index.html`) and costing (`costing.html`) for the 2,000-store CCTV monitoring system.

## Deploy to Fly.io

From this directory (`cctv-monitoring/`), with [flyctl](https://fly.io/docs/flyctl/install/) installed:

```sh
fly auth login
fly launch --copy-config --name <your-app-name> --region bom --now
```

Subsequent updates:

```sh
fly deploy
```

The site is served by nginx; no server-side code. `bom` = Mumbai region — change if needed.
