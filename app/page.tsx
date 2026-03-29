"use client";
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '../components/Sidebar';
const Dashboard = dynamic(() => import('../components/Dashboard').then(mod => mod.Dashboard), { ssr: false });
import { TaskList } from '../components/TaskList';
import { ScreenTimeUpload } from '../components/ScreenTimeUpload';
const History = dynamic(() => import('../components/History').then(mod => mod.History), { ssr: false });
import { Auth } from '../components/Auth';
import { Icons } from '../components/Icons';
import { UserProfile, WeeklyStats, Task, HistoryEntry, VerificationStatus, ScreenTimeEntry } from '../types';
import { calculateWeeklyRating } from '../services/geminiService';
import { useSession, signOut } from 'next-auth/react';

// --- DATE HELPERS ---
const getWeekIdFromDate = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const getCurrentWeekId = () => getWeekIdFromDate(new Date());

const App: React.FC = () => {
  const { data: session, status } = useSession();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  
  // User State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [screentime, setScreentime] = useState<ScreenTimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Check for existing session
  useEffect(() => {
    if (status === "loading") {
      setIsLoading(true);
      return;
    }
    
    if (status === "authenticated" && session?.user) {
      const googleId = (session.user as any).id || session.user.email || 'unknown';
      const userData = {
        name: session.user.name || 'User',
        email: session.user.email || '',
        avatarUrl: session.user.image || '',
        googleId: googleId,
        weeklyGoalHours: 80,
        currentStreak: 0
      };
      setUser(userData);
      setIsAuthenticated(true);
      fetchUserData(googleId, userData);
    } else {
      setIsLoading(false);
      setIsAuthenticated(false);
      setUser(null);
      setStats(null);
      setTasks([]);
      setHistory([]);
    }
  }, [status, session]);

  const fetchUserData = async (googleId: string, defaultUser: UserProfile) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/users/${googleId}/data`);
      if (!res.ok) throw new Error("Failed to fetch data from Redis backend");
      const data = await res.json();

      // Set Profile
      if (data.profile) {
        setUser(data.profile);
      } else {
        // Create profile if missing
        await fetch(`/api/users/${googleId}/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defaultUser)
        });
        setUser(defaultUser);
      }

      // Set Tasks
      const formattedTasks = data.tasks || [];
      formattedTasks.sort((a: Task, b: Task) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTasks(formattedTasks);

      // Set Screentime
      setScreentime(data.screentime || []);

      // Set Stats
      const currentWeekId = getCurrentWeekId();
      const allStats = data.stats || [];
      let currentStatsObj = allStats.find((s: WeeklyStats) => s.weekId === currentWeekId);
      
      const formattedHistory = allStats.filter((s: WeeklyStats) => s.weekId !== currentWeekId);
      formattedHistory.sort((a: WeeklyStats, b: WeeklyStats) => a.weekId.localeCompare(b.weekId));
      setHistory(formattedHistory);

      if (currentStatsObj) {
        setStats(currentStatsObj);
      } else {
        // Initialize current week
        const now = new Date();
        const currentDay = now.getDay(); 
        const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - distanceToMonday);
        monday.setHours(0, 0, 0, 0);
        const nextMonday = new Date(monday);
        nextMonday.setDate(monday.getDate() + 7);

        currentStatsObj = {
          weekId: currentWeekId,
          startDate: monday.toLocaleDateString(),
          endDate: new Date(nextMonday.getTime() - 1).toLocaleDateString(),
          goalHours: data.profile?.weeklyGoalHours || 80,
          completedHours: 0,
          screenTimeHours: 0,
          rating: 0,
          streakActive: true,
          userId: googleId
        };
        setStats(currentStatsObj);
        await fetch(`/api/users/${googleId}/stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentStatsObj)
        });
      }
    } catch (err: any) {
      console.error(err);
      setFetchError(err.message || "Failed to connect to backend.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteHistory = async (weekId: string) => {
    if (!user) return;
    if (!window.confirm(`Are you sure you want to delete the history for week ${weekId}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/users/${user.googleId}/stats?weekId=${weekId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setHistory(prev => prev.filter(h => h.weekId !== weekId));
      } else {
        alert("Failed to delete history entry.");
      }
    } catch (error) {
      console.error("Error deleting history:", error);
      alert("An error occurred while deleting history.");
    }
  };

  const handleLogout = () => {
    signOut();
  };

  const updateWeeklyGoal = async (newGoal: number) => {
    if (!user) return;
    const updatedUser = { ...user, weeklyGoalHours: newGoal };
    setUser(updatedUser);
    
    // Optimistic UI updates
    await fetch(`/api/users/${user.googleId}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedUser)
    });
    
    if (stats) {
        const updatedStats = { ...stats, goalHours: newGoal };
        setStats(updatedStats);
        await fetch(`/api/users/${user.googleId}/stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedStats)
        });
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

     const updatedStats = { ...stats, completedHours: newCompleted, rating: newRating };
     setStats(updatedStats);
     
     await fetch(`/api/users/${user.googleId}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStats)
    });
  };

  const handleScreenTimeSubmit = async (hours: number) => {
     if (!user || !stats) return;

     const newScreenTime = stats.screenTimeHours + hours;
     const newRating = await calculateWeeklyRating(
       stats.completedHours, 
       stats.goalHours, 
       newScreenTime
     );

     const updatedStats = { ...stats, screenTimeHours: newScreenTime, rating: newRating };
     setStats(updatedStats);

     // Update total stats
     await fetch(`/api/users/${user.googleId}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStats)
    });

    // Store individual screen time entry
    const entry = {
      date: new Date().toISOString().split('T')[0],
      hours,
      submittedAt: Date.now()
    };

    await fetch(`/api/users/${user.googleId}/screentime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
  };

  if (status === "loading" || (isLoading && !user)) {
    return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
            <Icons.Loader className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-slate-400 font-medium">Initializing...</p>
        </div>
    </div>;
  }

  if (!isAuthenticated || !user) {
    return <Auth />;
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
              onClick={() => fetchUserData(user.googleId!, user)}
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
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <Icons.Loader className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-slate-400 font-medium">Syncing data...</p>
              </div>
            </div>
          ) : (
            <>
              {currentView === 'dashboard' && stats && <Dashboard user={user} stats={stats} tasks={tasks} screentime={screentime} />}
              {currentView === 'tasks' && <TaskList tasks={tasks} setTasks={setTasks} user={user} updateCompletedHours={updateCompletedHours} />}
              {currentView === 'screentime' && <ScreenTimeUpload user={user} onSubmit={handleScreenTimeSubmit} />}
              {currentView === 'history' && stats && <History history={[...history, { ...stats, id: 'current' } as HistoryEntry]} tasks={tasks} screentime={screentime} onDeleteHistory={handleDeleteHistory} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
