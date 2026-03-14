import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;

if (!redisUrl || !redisToken) {
  console.warn("WARNING: UPSTASH_REDIS_URL or UPSTASH_REDIS_REST_TOKEN is not defined. Redis calls will fail.");
}

const redis = new Redis({
  url: redisUrl || 'http://localhost:8079',
  token: redisToken || 'example_token',
});

export default redis;
