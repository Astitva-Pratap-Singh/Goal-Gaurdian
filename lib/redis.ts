import { Redis } from '@upstash/redis';

let redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || process.env.KV_REST_API_URL;
let redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || process.env.KV_REST_API_TOKEN;

// Convert rediss:// or redis:// upstash URLs to REST URLs
if (redisUrl && (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://'))) {
  try {
    const parsedUrl = new URL(redisUrl);
    if (parsedUrl.hostname.includes('upstash.io')) {
      redisUrl = `https://${parsedUrl.hostname}`;
      if (parsedUrl.password) {
        redisToken = parsedUrl.password;
      }
    }
  } catch (e) {
    console.error("Failed to parse REDIS_URL", e);
  }
}

if (!redisUrl || !redisToken) {
  console.warn("WARNING: UPSTASH_REDIS_URL or UPSTASH_REDIS_REST_TOKEN is not defined. Redis calls will fail.");
}

const redis = new Redis({
  url: redisUrl || 'http://localhost:8079',
  token: redisToken || 'example_token',
});

export default redis;
