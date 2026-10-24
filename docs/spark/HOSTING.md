# Hosting: Cloudflare Pages

The whole site is static files, so Cloudflare Pages serves it straight from the GitHub repo (`Ashish-Kohli201/giftkit`, branch `main`) and redeploys on every push.

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | (empty) |
| Build output directory | `/` (if Cloudflare refuses a slash, use `.`) |
| Production branch | `main` |
| Custom domain | `fondlyshop.in` (and `www.fondlyshop.in`) |

Files Cloudflare reads from the repo root: `_redirects` (the front door `/` goes to `/site/`) and `_headers` (security headers).

Two places must agree on the address:

1. `SITE_URL` in the backend's settings (`https://fondlyshop.in`): every gift link the backend emails starts with it.
2. `api` in `site/config.js`: the Apps Script web app address. It does not depend on the domain: the backend accepts calls from any address.

The shop is at `https://fondlyshop.in/site/`, and a delivered gift at `https://fondlyshop.in/host/index.html?s=...`. Deploys are per push: nothing to build, and a bad push is undone from the Cloudflare dashboard (Deployments, Rollback).
