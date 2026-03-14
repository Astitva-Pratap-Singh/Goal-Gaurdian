import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const profileStr = await redis.get(`user:${userId}:profile`);
    const profile = profileStr ? JSON.parse(profileStr) : null;
    
    const tasksHash = await redis.hgetall(`user:${userId}:tasks`);
    const tasks = Object.values(tasksHash).map((t: any) => JSON.parse(t));
    
    const statsHash = await redis.hgetall(`user:${userId}:stats`);
    const stats = Object.values(statsHash).map((s: any) => JSON.parse(s));

    return NextResponse.json({ profile, tasks, stats });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
