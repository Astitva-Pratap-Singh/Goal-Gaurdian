import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { ScreenTimeUpload } from './components/ScreenTimeUpload';
import { History } from './components/History';
import { Auth } from './components/Auth';
import { UserProfile, WeeklyStats, Task, HistoryEntry } from './types';
import { calculateWeeklyRating } from './services/geminiService';
import { supabase } from './services/supabase';

// Helper to get current week ID (e.g., "2024-W22")
const getCurrentWeekId = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime() + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const day = Math.floor(diff / oneDay);
  const week = Math.ceil(day / 7);
  return `${now.getFullYear()}-W${week}`;
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

    // 1. Fetch History
    const { data: historyData } = await supabase
      .from('weekly_stats')
      .select('*')
      .eq('user_id', googleId)
      .neq('week_id', currentWeekId)
      .order('week_id', { ascending: true }); // Ensure chronological order

    if (historyData) {
      // Map DB snake_case to camelCase matches types
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
    }

    // 2. Fetch Current Week Stats or Create
    const { data: currentStats, error } = await supabase
      .from('weekly_stats')
      .select('*')
      .eq('user_id', googleId)
      .eq('week_id', currentWeekId)
      .single();

    if (currentStats) {
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
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6); // Sunday

      const newStats: WeeklyStats = {
        weekId: currentWeekId,
        startDate: startOfWeek.toLocaleDateString(),
        endDate: endOfWeek.toLocaleDateString(),
        goalHours: 80,
        completedHours: 0,
        screenTimeHours: 0,
        rating: 0,
        streakActive: true
      };

      const { error: insertError } = await supabase.from('weekly_stats').insert({
        user_id: googleId,
        week_id: newStats.weekId,
        start_date: newStats.startDate,
        end_date: newStats.endDate,
        goal_hours: newStats.goalHours
      });

      if (!insertError) setStats(newStats);
    }

    // 3. Fetch Tasks
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', googleId)
      .order('created_at', { ascending: false });

    if (tasksData) {
      const formattedTasks: Task[] = tasksData.map((t: any) => ({
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

    setIsLoading(false);
  };

  const handleLogin = async (userData: any) => {
    // Upsert User to Supabase
    const { error } = await supabase.from('profiles').upsert({
      google_id: userData.googleId,
      email: userData.email,
      name: userData.name,
      avatar_url: userData.avatarUrl,
      weekly_goal_hours: 80
    }, { onConflict: 'google_id' });

    if (error) {
      console.error("Supabase Login Error", error);
    }

    const newUser: UserProfile = {
      name: userData.name,
      email: userData.email,
      avatarUrl: userData.avatarUrl,
      googleId: userData.googleId,
      weeklyGoalHours: 80, 
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

  const updateCompletedHours = async (hoursToAdd: number) => {
     if (!user || !stats) return;

     const newCompleted = stats.completedHours + hoursToAdd;
     const newRating = await calculateWeeklyRating(
       newCompleted, 
       stats.goalHours, 
       stats.screenTimeHours
     );

     // Update local state
     setStats(prev => prev ? ({ ...prev, completedHours: newCompleted, rating: newRating }) : null);
     
     // Update DB
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

     // Update DB
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
    return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">Loading your dashboard...</div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#020617] text-slate-50 font-sans">
      <Sidebar 
        user={user} 
        currentView={currentView} 
        setView={setCurrentView} 
        onLogout={handleLogout}
      />
      
      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto h-full">
          {currentView === 'dashboard' && <Dashboard user={user} stats={stats} tasks={tasks} />}
          {currentView === 'tasks' && <TaskList tasks={tasks} setTasks={setTasks} user={user} updateCompletedHours={updateCompletedHours} />}
          {currentView === 'screentime' && <ScreenTimeUpload onSubmit={handleScreenTimeSubmit} />}
          {currentView === 'history' && <History history={[...history, { ...stats, id: 'current' } as HistoryEntry]} />}
        </div>
      </main>
    </div>
  );
};

export default App;