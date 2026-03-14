import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const stat = await request.json();
    await redis.hset(`user:${userId}:stats`, { [stat.weekId]: stat });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update stats" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const statsHash = await redis.hgetall(`user:${userId}:stats`);
    const stats = statsHash ? Object.values(statsHash) : [];
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
