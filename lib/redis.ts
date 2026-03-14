import Redis from "ioredis";

const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;

if (!redisUrl) {
  console.warn("WARNING: UPSTASH_REDIS_URL or REDIS_URL is not defined. Redis calls will fail.");
}

const redis = new Redis(redisUrl || "redis://localhost:6379", {
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  retryStrategy(times) {
    if (times > 3) {
      return null; // Stop retrying
    }
    return Math.min(times * 50, 2000);
  }
});

export default redis;
