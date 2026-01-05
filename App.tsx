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

    try {
      // Parallel execution for faster load times
      // We fetch everything at once instead of awaiting sequentially
      const [profileRes, tasksRes, historyRes, currentStatsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('google_id', googleId).single(),
        supabase.from('tasks').select('*').eq('user_id', googleId).order('created_at', { ascending: false }),
        supabase.from('weekly_stats').select('*').eq('user_id', googleId).neq('week_id', currentWeekId).order('week_id', { ascending: true }),
        supabase.from('weekly_stats').select('*').eq('user_id', googleId).eq('week_id', currentWeekId).single()
      ]);

      // 1. Process Profile
      if (profileRes.data && user) {
         // Only update if different to avoid flickering/unnecessary writes
         const newGoal = profileRes.data.weekly_goal_hours || 80;
         if (user.weeklyGoalHours !== newGoal) {
             const updatedUser = { ...user, weeklyGoalHours: newGoal };
             setUser(updatedUser);
             localStorage.setItem('focusforge_user', JSON.stringify(updatedUser));
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
          createdAt: t.created_at,
          completedAt: t.completed_at,
          status: t.status,
          proofImage: t.proof_image,
          rejectionReason: t.rejection_reason
        }));
        setTasks(formattedTasks);
      }

      // 3. Process History
      let calculatedStreak = 0;
      if (historyRes.data) {
        const formattedHistory: HistoryEntry[] = historyRes.data.map((h: any) => ({
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

      // Update User Streak locally if needed
      if (user && user.currentStreak !== calculatedStreak) {
          setUser(prev => {
              if (!prev) return null;
              const updated = { ...prev, currentStreak: calculatedStreak };
              localStorage.setItem('focusforge_user', JSON.stringify(updated));
              return updated;
          });
      }

      // 4. Process Current Stats & Self-Healing
      // Calculate actual completed hours for THIS week from Tasks
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

      if (statsData) {
        // Prepare stats object
        let statsToSet = {
          weekId: statsData.week_id,
          goalHours: statsData.goal_hours,
          completedHours: statsData.completed_hours,
          screenTimeHours: statsData.screen_time_hours,
          rating: statsData.rating,
          streakActive: statsData.streak_active,
          startDate: statsData.start_date,
          endDate: statsData.end_date
        };

        // Self-heal check (Optimistic UI update)
        // If DB stats mismatch actual task logs, use the calculated value and sync DB in background
        if (Math.abs(statsData.completed_hours - actualCompletedHours) > 0.1) {
            statsToSet.completedHours = actualCompletedHours;
            
            // Background update - DO NOT AWAIT, prevents blocking UI
            supabase.from('weekly_stats')
              .update({ completed_hours: actualCompletedHours })
              .eq('week_id', currentWeekId)
              .eq('user_id', googleId)
              .then(({ error }) => {
                 if (error) console.error("Background stat sync failed", error);
              });
        }
        setStats(statsToSet);
      } else {
        // Create new week entry (Optimistic UI)
        const currentGoal = profileRes.data?.weekly_goal_hours || (user?.weeklyGoalHours || 80);

        const newStats: WeeklyStats = {
          weekId: currentWeekId,
          startDate: monday.toLocaleDateString(),
          endDate: new Date(nextMonday.getTime() - 1).toLocaleDateString(),
          goalHours: currentGoal,
          completedHours: actualCompletedHours,
          screenTimeHours: 0,
          rating: 0,
          streakActive: true
        };

        setStats(newStats);

        // Background Insert - DO NOT AWAIT
        supabase.from('weekly_stats').insert({
          user_id: googleId,
          week_id: newStats.weekId,
          start_date: newStats.startDate,
          end_date: newStats.endDate,
          goal_hours: newStats.goalHours,
          completed_hours: newStats.completedHours
        }).then(({ error }) => {
            if (error) console.error("Error creating weekly stats", error);
        });
      }

    } catch (err) {
        console.error("Critical error fetching user data:", err);
        // Ensure we stop loading even on error so user isn't stuck
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogin = async (userData: any) => {
    // Optimistic Login Handling
    const newUser: UserProfile = {
      name: userData.name,
      email: userData.email,
      avatarUrl: userData.avatarUrl,
      googleId: userData.googleId,
      weeklyGoalHours: 80, // Default until fetched
      currentStreak: 0 
    };
    setUser(newUser);
    localStorage.setItem('focusforge_user', JSON.stringify(newUser));
    setIsAuthenticated(true);
    
    // Fire off fetches
    // We try to get existing profile first to honor user's goal settings
    try {
        const { data: existingProfile } = await supabase.from('profiles').select('weekly_goal_hours').eq('google_id', userData.googleId).single();
        const userGoal = existingProfile?.weekly_goal_hours || 80;
        
        // Update user state with correct goal
        if (userGoal !== 80) {
            const refinedUser = { ...newUser, weeklyGoalHours: userGoal };
            setUser(refinedUser);
            localStorage.setItem('focusforge_user', JSON.stringify(refinedUser));
        }

        // Upsert profile in background
        supabase.from('profiles').upsert({
            google_id: userData.googleId,
            email: userData.email,
            name: userData.name,
            avatar_url: userData.avatarUrl,
            weekly_goal_hours: userGoal 
        }, { onConflict: 'google_id' }).then(({ error }) => {
             if (error) console.error("Supabase Profile Upsert Error", error);
        });

    } catch (e) {
        console.error("Login process error", e);
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