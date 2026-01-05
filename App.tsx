import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { ScreenTimeUpload } from './components/ScreenTimeUpload';
import { History } from './components/History';
import { Auth } from './components/Auth';
import { UserProfile, WeeklyStats, Task, HistoryEntry, VerificationStatus } from './types';
import { calculateWeeklyRating } from './services/geminiService';
import { supabase } from './services/supabase';

// Robust ISO Week ID Calculator (YYYY-Www)
const getCurrentWeekId = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  
  // User State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Check for existing session
  useEffect(() => {
    const savedUser = localStorage.getItem('focusforge_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setIsAuthenticated(true);
      fetchUserData(parsedUser.googleId);
    }
  }, []);

  const fetchUserData = async (googleId: string) => {
    setIsLoading(true);
    const currentWeekId = getCurrentWeekId();

    // 0. Fetch User Profile to get goal
    const { data: profile } = await supabase.from('profiles').select('*').eq('google_id', googleId).single();
    if (profile && user) {
       const updatedUser = { ...user, weeklyGoalHours: profile.weekly_goal_hours || 80 };
       setUser(updatedUser);
       localStorage.setItem('focusforge_user', JSON.stringify(updatedUser));
    }

    // 1. Fetch Tasks FIRST to allow recalculation of stats
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', googleId)
      .order('created_at', { ascending: false });

    let formattedTasks: Task[] = [];
    if (tasksData) {
      formattedTasks = tasksData.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type,
        durationHours: t.duration_hours,
        createdAt: t.created_at,
        completedAt: t.completed_at,
        status: t.status,
        proofImage: t.proof_image,
        rejectionReason: t.rejection_reason
      }));
      setTasks(formattedTasks);
    }

    // 2. Fetch History (Excluding current week)
    const { data: historyData } = await supabase
      .from('weekly_stats')
      .select('*')
      .eq('user_id', googleId)
      .neq('week_id', currentWeekId)
      .order('week_id', { ascending: true });

    let calculatedStreak = 0;
    
    if (historyData) {
      const formattedHistory: HistoryEntry[] = historyData.map((h: any) => ({
        id: h.id,
        weekId: h.week_id,
        goalHours: h.goal_hours,
        completedHours: h.completed_hours,
        screenTimeHours: h.screen_time_hours,
        rating: h.rating,
        streakActive: h.streak_active,
        startDate: h.start_date,
        endDate: h.end_date
      }));
      setHistory(formattedHistory);

      // Recalculate Streak
      const reversedHistory = [...formattedHistory].sort((a, b) => b.weekId.localeCompare(a.weekId));
      for (const entry of reversedHistory) {
         if (entry.completedHours >= entry.goalHours) {
           calculatedStreak++;
         } else {
           break; 
         }
      }
    } else {
      setHistory([]);
    }

    // Update User Streak
    setUser((prev) => {
        if (!prev) return null;
        const updated = { ...prev, currentStreak: calculatedStreak };
        localStorage.setItem('focusforge_user', JSON.stringify(updated));
        return updated;
    });

    // 3. Fetch Current Week Stats or Create
    const { data: currentStats } = await supabase
      .from('weekly_stats')
      .select('*')
      .eq('user_id', googleId)
      .eq('week_id', currentWeekId)
      .single();

    // Calculate actual completed hours for THIS week from Tasks
    // This ensures that if the week switches, we don't accidentally show old data if the DB record was reused or malformed,
    // and we self-heal any drift between tasks and stats.
    const now = new Date();
    const currentDay = now.getDay(); 
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const actualCompletedHours = formattedTasks
      .filter(t => {
         if (t.status !== VerificationStatus.VERIFIED || !t.completedAt) return false;
         const d = new Date(t.completedAt);
         return d >= monday && d < nextMonday;
      })
      .reduce((acc, t) => acc + t.durationHours, 0);

    if (currentStats) {
      // Check if we need to self-heal
      if (Math.abs(currentStats.completed_hours - actualCompletedHours) > 0.1) {
          await supabase.from('weekly_stats')
            .update({ completed_hours: actualCompletedHours })
            .eq('week_id', currentWeekId)
            .eq('user_id', googleId);
          currentStats.completed_hours = actualCompletedHours;
      }

      setStats({
        weekId: currentStats.week_id,
        goalHours: currentStats.goal_hours,
        completedHours: currentStats.completed_hours,
        screenTimeHours: currentStats.screen_time_hours,
        rating: currentStats.rating,
        streakActive: currentStats.streak_active,
        startDate: currentStats.start_date,
        endDate: currentStats.end_date
      });
    } else {
      // Create new week entry
      const currentGoal = profile?.weekly_goal_hours || 80;

      const newStats: WeeklyStats = {
        weekId: currentWeekId,
        startDate: monday.toLocaleDateString(),
        endDate: new Date(nextMonday.getTime() - 1).toLocaleDateString(),
        goalHours: currentGoal,
        completedHours: actualCompletedHours, // Initialize with what we found (usually 0 for new week)
        screenTimeHours: 0,
        rating: 0,
        streakActive: true
      };

      const { error: insertError } = await supabase.from('weekly_stats').insert({
        user_id: googleId,
        week_id: newStats.weekId,
        start_date: newStats.startDate,
        end_date: newStats.endDate,
        goal_hours: newStats.goalHours,
        completed_hours: newStats.completedHours
      });

      if (!insertError) setStats(newStats);
    }

    setIsLoading(false);
  };

  const handleLogin = async (userData: any) => {
    const { data: existingProfile } = await supabase.from('profiles').select('weekly_goal_hours').eq('google_id', userData.googleId).single();
    const userGoal = existingProfile?.weekly_goal_hours || 80;

    const { error } = await supabase.from('profiles').upsert({
      google_id: userData.googleId,
      email: userData.email,
      name: userData.name,
      avatar_url: userData.avatarUrl,
      weekly_goal_hours: userGoal 
    }, { onConflict: 'google_id' });

    if (error) {
      console.error("Supabase Login Error", error);
    }

    const newUser: UserProfile = {
      name: userData.name,
      email: userData.email,
      avatarUrl: userData.avatarUrl,
      googleId: userData.googleId,
      weeklyGoalHours: userGoal, 
      currentStreak: 0 
    };
    setUser(newUser);
    localStorage.setItem('focusforge_user', JSON.stringify(newUser));
    setIsAuthenticated(true);
    fetchUserData(userData.googleId);
  };

  const handleLogout = () => {
    localStorage.removeItem('focusforge_user');
    setUser(null);
    setStats(null);
    setTasks([]);
    setHistory([]);
    setIsAuthenticated(false);
  };

  const updateWeeklyGoal = async (newGoal: number) => {
    if (!user) return;
    
    const updatedUser = { ...user, weeklyGoalHours: newGoal };
    setUser(updatedUser);
    localStorage.setItem('focusforge_user', JSON.stringify(updatedUser));
    
    await supabase.from('profiles').update({ weekly_goal_hours: newGoal }).eq('google_id', user.googleId);
    
    if (stats) {
        setStats({ ...stats, goalHours: newGoal });
        await supabase.from('weekly_stats')
            .update({ goal_hours: newGoal })
            .eq('user_id', user.googleId)
            .eq('week_id', stats.weekId);
    }
  };

  const updateCompletedHours = async (hoursToAdd: number) => {
     if (!user || !stats) return;

     const newCompleted = stats.completedHours + hoursToAdd;
     const newRating = await calculateWeeklyRating(
       newCompleted, 
       stats.goalHours, 
       stats.screenTimeHours
     );

     setStats(prev => prev ? ({ ...prev, completedHours: newCompleted, rating: newRating }) : null);
     
     await supabase
       .from('weekly_stats')
       .update({ completed_hours: newCompleted, rating: newRating })
       .eq('user_id', user.googleId)
       .eq('week_id', stats.weekId);
  };

  const handleScreenTimeSubmit = async (hours: number, image: string) => {
     if (!user || !stats) return;

     const newScreenTime = stats.screenTimeHours + hours;
     const newRating = await calculateWeeklyRating(
       stats.completedHours, 
       stats.goalHours, 
       newScreenTime
     );

     setStats(prev => prev ? ({ ...prev, screenTimeHours: newScreenTime, rating: newRating }) : null);

     await supabase
       .from('weekly_stats')
       .update({ screen_time_hours: newScreenTime, rating: newRating })
       .eq('user_id', user.googleId)
       .eq('week_id', stats.weekId);
  };

  if (!isAuthenticated || !user) {
    return <Auth onLogin={handleLogin} />;
  }

  if (isLoading || !stats) {
    return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p>Syncing verified tasks...</p>
        </div>
    </div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#020617] text-slate-50 font-sans">
      <Sidebar 
        user={user} 
        currentView={currentView} 
        setView={setCurrentView} 
        onLogout={handleLogout}
        onUpdateGoal={updateWeeklyGoal}
      />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto h-full">
          {currentView === 'dashboard' && <Dashboard user={user} stats={stats} tasks={tasks} />}
          {currentView === 'tasks' && <TaskList tasks={tasks} setTasks={setTasks} user={user} updateCompletedHours={updateCompletedHours} />}
          {currentView === 'screentime' && <ScreenTimeUpload user={user} onSubmit={handleScreenTimeSubmit} />}
          {currentView === 'history' && <History history={[...history, { ...stats, id: 'current' } as HistoryEntry]} />}
        </div>
      </main>
    </div>
  );
};

export default App;