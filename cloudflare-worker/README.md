# Discord API Reverse Proxy (Cloudflare Worker)

If Render's shared IP address gets rate-limited by Discord (`HTTP 429 Retry after 10000s`), you can use a free Cloudflare Worker reverse proxy. Discord never rate-limits Cloudflare edge IP addresses.

---

### Step 1: Create a Cloudflare Worker (1 Minute)
1. Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/) and sign in (or create a free account).
2. Click **Workers & Pages** -> **Create application** -> **Create Worker**.
3. Name it (e.g. `beelert-discord-proxy`) and click **Deploy**.
4. Click **Edit code** and replace the existing code with the contents of [`worker.js`](worker.js).
5. Click **Deploy** in the top right.

---

### Step 2: Add Environment Variable in Render
1. In Cloudflare, copy your Worker URL:
   `https://beelert-discord-proxy.<your-subdomain>.workers.dev`
2. Open your Render dashboard:
   `https://dashboard.render.com/` -> Select your BeeLert Web Service -> **Environment**.
3. Add:
   - **Key**: `DISCORD_API_PROXY`
   - **Value**: `https://beelert-discord-proxy.<your-subdomain>.workers.dev/api`
4. Click **Save Changes**.

Render will automatically restart the service and your bot will connect to Discord immediately without IP blocks!
