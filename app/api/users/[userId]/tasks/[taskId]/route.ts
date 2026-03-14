import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function DELETE(request: Request, { params }: { params: { userId: string, taskId: string } }) {
  const { userId, taskId } = params;
  try {
    await redis.hdel(`user:${userId}:tasks`, taskId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
