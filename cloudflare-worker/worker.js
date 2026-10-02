/**
 * Discord API Reverse Proxy for Cloudflare Workers
 * 
 * Free tier: 100,000 requests / day (more than enough for BeeLert).
 * Bypasses Render / shared hosting IP rate limits (HTTP 429) permanently.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Target official Discord API
    url.hostname = 'discord.com';
    url.port = '443';
    url.protocol = 'https:';

    // Clone and adjust headers
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', 'discord.com');

    // Create the forwarded request
    const proxyRequest = new Request(url.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow'
    });

    return fetch(proxyRequest);
  }
};
