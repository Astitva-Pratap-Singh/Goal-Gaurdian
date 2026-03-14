import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const body = await request.json();
    await redis.set(`user:${userId}:profile`, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const profile = await redis.get(`user:${userId}:profile`);
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
