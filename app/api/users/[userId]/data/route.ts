import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const profile = await redis.get(`user:${userId}:profile`);
    
    const tasksHash = await redis.hgetall(`user:${userId}:tasks`);
    const tasks = tasksHash ? Object.values(tasksHash) : [];
    
    const statsHash = await redis.hgetall(`user:${userId}:stats`);
    const stats = statsHash ? Object.values(statsHash) : [];

    const screentimeHash = await redis.hgetall(`user:${userId}:screentime`);
    const screentime = screentimeHash ? Object.values(screentimeHash) : [];

    return NextResponse.json({ profile, tasks, stats, screentime });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
