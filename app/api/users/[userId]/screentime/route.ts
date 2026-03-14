import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const entry = await request.json();
    // Use a list to store screen time entries, or a hash with date as key
    // Let's use a hash with timestamp as key to keep all entries
    await redis.hset(`user:${userId}:screentime`, { [entry.submittedAt]: entry });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to store screen time entry" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const { userId } = params;
  try {
    const entriesHash = await redis.hgetall(`user:${userId}:screentime`);
    const entries = entriesHash ? Object.values(entriesHash) : [];
    return NextResponse.json(entries);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch screen time entries" }, { status: 500 });
  }
}
