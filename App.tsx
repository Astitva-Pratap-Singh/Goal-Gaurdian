import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { ScreenTimeUpload } from './components/ScreenTimeUpload';
import { History } from './components/History';
import { Auth } from './components/Auth';
import { Icons } from './components/Icons';
import { UserProfile, WeeklyStats, Task, HistoryEntry, VerificationStatus } from './types';
import { calculateWeeklyRating } from './services/geminiService';
import { supabase } from './services/supabase';

// --- DATE HELPERS ---

const getWeekIdFromDate = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

// Robust ISO Week ID Calculator (YYYY-Www)
const getCurrentWeekId = () => getWeekIdFromDate(new Date());

const getPreviousWeekId = (weekId: string) => {
  // Approximate reverse calculation to find the previous week ID
  // We parse the year and week, find a date in that week, subtract 7 days, and recalculate ID
  const [yStr, wStr] = weekId.split('-W');
  const y = parseInt(yStr, 10);
  const w = parseInt(wStr, 10);
  
  // Simple heuristic: 4th of Jan is always in week 1
  const d = new Date(y, 0, 4);
  // Add (w - 1) weeks to get to the target week
  d.setDate(d.getDate() + (w - 1) * 7);
  // Subtract 7 days to get previous week
  d.setDate(d.getDate() - 7);
  
  return getWeekIdFromDate(d);
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
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  const fetchUserData = async (googleId: string, backgroundSync = false) => {
    if (!backgroundSync) {
      setIsLoading(true);
      setFetchError(null);
    }
    const currentWeekId = getCurrentWeekId();

    try {
      // Parallel execution for faster load times
      // CRITICAL OPTIMIZATION: Exclude 'proof_image' from tasks fetch. It is huge (Base64).
      // We load it on-demand in TaskList.
      const [profileRes, tasksRes, historyRes, currentStatsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('google_id', googleId).single(),
        supabase
          .from('tasks')
          .select('id, title, description, type, duration_hours, created_at, completed_at, status, rejection_reason') // Explicitly select columns to avoid downloading images
          .eq('user_id', googleId)
          .order('created_at', { ascending: false }), 
        supabase.from('weekly_stats').select('*').eq('user_id', googleId).neq('week_id', currentWeekId).order('week_id', { ascending: true }),
        supabase.from('weekly_stats').select('*').eq('user_id', googleId).eq('week_id', currentWeekId).single()
      ]);

      // Check for missing tables or other critical DB errors
      const errors = [profileRes.error, tasksRes.error, historyRes.error, currentStatsRes.error];
      for (const err of errors) {
        if (err && err.code === '42P01') {
          throw new Error("Database tables are missing. Please run the SQL schema to recreate them.");
        }
        if (err && err.message && (err.message.includes('Load failed') || err.message.includes('Failed to fetch'))) {
          throw new Error("Network error: Could not connect to Supabase. If you are on a mobile device, ensure SUPABASE_URL uses your computer's local IP address (e.g., 192.168.x.x) instead of localhost.");
        }
      }
      if (profileRes.error && profileRes.error.code !== 'PGRST116') {
        throw new Error(profileRes.error.message);
      }

      // 1. Process Profile
      let currentUserGoal = 80;
      if (profileRes.data && user) {
         currentUserGoal = profileRes.data.weekly_goal_hours || 80;
         if (user.weeklyGoalHours !== currentUserGoal) {
             const updatedUser = { ...user, weeklyGoalHours: currentUserGoal };
             setUser(updatedUser);
             localStorage.setItem('focusforge_user', JSON.stringify(updatedUser));
         }
      } else if (profileRes.error && profileRes.error.code === 'PGRST116') {
         // Profile doesn't exist (e.g. DB was wiped but localStorage remained)
         // We can recreate it using the data from localStorage
         const savedUser = localStorage.getItem('focusforge_user');
         if (savedUser) {
             const parsedUser = JSON.parse(savedUser);
             await supabase.from('profiles').upsert({
                 google_id: googleId,
                 email: parsedUser.email,
                 name: parsedUser.name,
                 avatar_url: parsedUser.avatarUrl,
                 weekly_goal_hours: parsedUser.weeklyGoalHours || 80
             }, { onConflict: 'google_id' });
             currentUserGoal = parsedUser.weeklyGoalHours || 80;
         }
      }

      // 2. Process Tasks
      let formattedTasks: Task[] = [];
      if (tasksRes.data) {
        formattedTasks = tasksRes.data.map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          type: t.type,
          durationHours: t.duration_hours,
          // Convert to timestamp numbers for reliable sorting/math
          createdAt: new Date(t.completed_at || t.created_at).getTime(), 
          completedAt: t.completed_at ? new Date(t.completed_at).getTime() : undefined,
          status: t.status,
          // proofImage is undefined here to save bandwidth. Loaded lazy.
          rejectionReason: t.rejection_reason
        }));
        // Sort in memory to ensure order
        formattedTasks.sort((a, b) => b.createdAt - a.createdAt);
        setTasks(formattedTasks);
      }

      // 3. Process History
      let formattedHistory: HistoryEntry[] = [];
      if (historyRes.data) {
        formattedHistory = historyRes.data.map((h: any) => ({
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

      // 4. Process Current Stats & Self-Healing
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

      const statsData = currentStatsRes.data;
      let currentStatsObj: WeeklyStats;

      if (statsData) {
        currentStatsObj = {
          weekId: statsData.week_id,
          goalHours: statsData.goal_hours,
          completedHours: statsData.completed_hours,
          screenTimeHours: statsData.screen_time_hours,
          rating: statsData.rating,
          streakActive: statsData.streak_active,
          startDate: statsData.start_date,
          endDate: statsData.end_date
        };

        // Self-heal check (only if significant difference)
        if (Math.abs(statsData.completed_hours - actualCompletedHours) > 0.1) {
            currentStatsObj.completedHours = actualCompletedHours;
            // Fire and forget update
            supabase.from('weekly_stats')
              .update({ completed_hours: actualCompletedHours })
              .eq('week_id', currentWeekId)
              .eq('user_id', googleId)
              .then(({ error }) => { if (error) console.error("Background stat sync failed", error); });
        }
        setStats(currentStatsObj);
      } else {
        // Create new week
        currentStatsObj = {
          weekId: currentWeekId,
          startDate: monday.toLocaleDateString(),
          endDate: new Date(nextMonday.getTime() - 1).toLocaleDateString(),
          goalHours: currentUserGoal,
          completedHours: actualCompletedHours,
          screenTimeHours: 0,
          rating: 0,
          streakActive: true
        };
        setStats(currentStatsObj);
        supabase.from('weekly_stats').insert({
          user_id: googleId,
          week_id: currentStatsObj.weekId,
          start_date: currentStatsObj.startDate,
          end_date: currentStatsObj.endDate,
          goal_hours: currentStatsObj.goalHours,
          completed_hours: currentStatsObj.completedHours
        }).then(({ error }) => { if (error) console.error("Error creating weekly stats", error); });
      }

      // --- STREAK CALCULATION LOGIC ---
      let streak = 0;
      let checkWeekId = currentWeekId;

      if (currentStatsObj.completedHours >= currentStatsObj.goalHours) {
        streak++;
        checkWeekId = getPreviousWeekId(checkWeekId);
      } else {
        checkWeekId = getPreviousWeekId(checkWeekId);
      }

      const reversedHistory = [...formattedHistory].sort((a, b) => b.weekId.localeCompare(a.weekId));
      
      for (const entry of reversedHistory) {
         if (entry.weekId !== checkWeekId) break; 
         if (entry.completedHours >= entry.goalHours) {
           streak++;
           checkWeekId = getPreviousWeekId(checkWeekId);
         } else {
           break;
         }
      }

      if (user && user.currentStreak !== streak) {
          setUser(prev => {
              if (!prev) return null;
              const updated = { ...prev, currentStreak: streak };
              localStorage.setItem('focusforge_user', JSON.stringify(updated));
              return updated;
          });
      }

    } catch (err: any) {
        console.error("Critical error fetching user data:", err);
        setFetchError(err.message || "Failed to connect to Supabase. Is the container running?");
    } finally {
        if (!backgroundSync) setIsLoading(false);
    }
  };

  const handleLogin = async (userData: any) => {
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
    
    try {
      // Await profile upsert to prevent foreign key errors in fetchUserData
      const { data } = await supabase.from('profiles').select('weekly_goal_hours').eq('google_id', userData.googleId).single();
      const userGoal = data?.weekly_goal_hours || 80;
      if (userGoal !== 80) {
          setUser(prev => prev ? { ...prev, weeklyGoalHours: userGoal } : prev);
      }
      await supabase.from('profiles').upsert({
          google_id: userData.googleId,
          email: userData.email,
          name: userData.name,
          avatar_url: userData.avatarUrl,
          weekly_goal_hours: userGoal 
      }, { onConflict: 'google_id' });
    } catch (err) {
      console.error("Error upserting profile:", err);
    }

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
    
    // Optimistic UI updates, no need to wait or refetch
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

     // Optimistic Update
     setStats(prev => prev ? ({ ...prev, completedHours: newCompleted, rating: newRating }) : null);
     
     // Background DB Update
     await supabase
       .from('weekly_stats')
       .update({ completed_hours: newCompleted, rating: newRating })
       .eq('user_id', user.googleId)
       .eq('week_id', stats.weekId);
       
     // REMOVED: fetchUserData call. Local state is already accurate.
     // This prevents the "way too time taking" sync after every task.
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
    if (!fetchError) {
      return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
          <div className="flex flex-col items-center gap-4">
              <Icons.Loader className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-slate-400 font-medium">Syncing data...</p>
          </div>
      </div>;
    }
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white p-4">
        <div className="bg-slate-900 border border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <Icons.Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Load Failed</h2>
          <p className="text-slate-400 mb-6">{fetchError}</p>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={() => fetchUserData(user.googleId!)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Retry
            </button>
            <button 
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
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
          {currentView === 'dashboard' && <Dashboard user={user} stats={stats!} tasks={tasks} />}
          {currentView === 'tasks' && <TaskList tasks={tasks} setTasks={setTasks} user={user} updateCompletedHours={updateCompletedHours} />}
          {currentView === 'screentime' && <ScreenTimeUpload user={user} onSubmit={handleScreenTimeSubmit} />}
          {currentView === 'history' && <History history={[...history, { ...stats!, id: 'current' } as HistoryEntry]} tasks={tasks} />}
        </div>
      </main>
    </div>
  );
};

export default App;