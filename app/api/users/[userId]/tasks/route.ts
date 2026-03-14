import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const task = await request.json();
    await redis.hset(`user:${userId}:tasks`, { [task.id]: task });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to add task" }, { status: 500 });
  }
}
