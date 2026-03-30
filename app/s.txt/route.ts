import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import redis from '@/lib/redis';

const getWeekIdFromDate = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return new NextResponse(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const userId = (session.user as any).id || session.user.email;
    const weekId = getWeekIdFromDate(new Date());

    // Fetch stats
    const statsHash = await redis.hgetall(`user:${userId}:stats`);
    const allStats = statsHash ? Object.values(statsHash) : [];
    const weekStats = allStats.find((s: any) => s.weekId === weekId) || null;

    // Fetch tasks
    const tasksHash = await redis.hgetall(`user:${userId}:tasks`);
    const allTasks = tasksHash ? Object.values(tasksHash) : [];
    
    // Filter tasks for the specific week
    const weekTasks = allTasks.filter((task: any) => {
      if (!task.completedAt) return false;
      return getWeekIdFromDate(new Date(task.completedAt)) === weekId;
    });

    // Sort tasks by completion date (newest first)
    weekTasks.sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    // Fetch screentime
    const screentimeHash = await redis.hgetall(`user:${userId}:screentime`);
    const allScreentime = screentimeHash ? Object.values(screentimeHash) : [];
    
    // Filter screentime for the specific week
    const weekScreentime = allScreentime.filter((st: any) => {
      if (!st.date) return false;
      return getWeekIdFromDate(new Date(st.date)) === weekId;
    });

    const responseData = {
      weekId,
      stats: weekStats,
      completedTasks: weekTasks,
      screentime: weekScreentime,
      totalCompletedTasks: weekTasks.length,
    };

    return new NextResponse(JSON.stringify(responseData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    console.error("Failed to fetch weekly stats:", error);
    return new NextResponse(JSON.stringify({ error: "Failed to fetch weekly stats" }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
