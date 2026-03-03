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
import { db, auth } from './services/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        const userData = {
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          avatarUrl: firebaseUser.photoURL || '',
          googleId: firebaseUser.uid,
          weeklyGoalHours: 80, // Default, will be overwritten by DB
          currentStreak: 0
        };
        setUser(userData);
        setIsAuthenticated(true);
        fetchUserData(firebaseUser.uid);
      } else {
        // User is signed out
        // Check local storage for demo user or persisted session if needed, 
        // but Firebase auth is the source of truth.
        const savedUser = localStorage.getItem('focusforge_user');
        if (savedUser) {
           // If we have a saved user but firebase says signed out, 
           // it might be a demo user or expired session.
           // For now, let's trust firebase auth state mostly, 
           // but allow demo user bypass if needed.
           const parsedUser = JSON.parse(savedUser);
           if (parsedUser.googleId === 'dev-123') {
             setUser(parsedUser);
             setIsAuthenticated(true);
             fetchUserData(parsedUser.googleId);
           } else {
             setIsAuthenticated(false);
             setUser(null);
           }
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchUserData = async (googleId: string, backgroundSync = false) => {
    if (!backgroundSync) {
      setIsLoading(true);
      setFetchError(null);
    }
    const currentWeekId = getCurrentWeekId();

    try {
      // Parallel execution for faster load times
      
      // 1. Profile
      const profileRef = doc(db, 'users', googleId);
      const profileSnapPromise = getDoc(profileRef);

      // 2. Tasks
      const tasksQuery = query(
        collection(db, 'tasks'), 
        where('userId', '==', googleId),
        orderBy('createdAt', 'desc')
      );
      const tasksSnapPromise = getDocs(tasksQuery);

      // 3. History (Weekly Stats excluding current week)
      const historyQuery = query(
        collection(db, 'weeklyStats'),
        where('userId', '==', googleId),
        where('weekId', '!=', currentWeekId),
        orderBy('weekId', 'asc')
      );
      // Note: Firestore requires composite index for this query. 
      // If it fails, we might need to fetch all and filter in memory or create index.
      // Fallback: fetch all stats for user and filter.
      const allStatsQuery = query(
        collection(db, 'weeklyStats'),
        where('userId', '==', googleId)
      );
      const allStatsSnapPromise = getDocs(allStatsQuery);

      const [profileSnap, tasksSnap, allStatsSnap] = await Promise.all([
        profileSnapPromise,
        tasksSnapPromise,
        allStatsSnapPromise
      ]);

      // 1. Process Profile
      let currentUserGoal = 80;
      if (profileSnap.exists()) {
         const data = profileSnap.data();
         currentUserGoal = data.weeklyGoalHours || 80;
         if (user && user.weeklyGoalHours !== currentUserGoal) {
             const updatedUser = { ...user, weeklyGoalHours: currentUserGoal };
             setUser(updatedUser);
             localStorage.setItem('focusforge_user', JSON.stringify(updatedUser));
         }
      } else {
         // Profile doesn't exist, create it
         if (user) {
             await setDoc(profileRef, {
                 email: user.email,
                 name: user.name,
                 avatarUrl: user.avatarUrl,
                 weeklyGoalHours: 80
             });
         }
      }

      // 2. Process Tasks
      let formattedTasks: Task[] = [];
      tasksSnap.forEach((doc) => {
        const data = doc.data();
        formattedTasks.push({
          id: doc.id,
          title: data.title,
          description: data.description,
          type: data.type,
          durationHours: data.durationHours,
          createdAt: data.createdAt,
          completedAt: data.completedAt,
          status: data.status,
          rejectionReason: data.rejectionReason,
          proofImage: data.proofImage // Firestore stores URL directly usually
        });
      });
      // Sort in memory just in case
      formattedTasks.sort((a, b) => b.createdAt - a.createdAt);
      setTasks(formattedTasks);

      // 3. Process Stats & History
      let formattedHistory: HistoryEntry[] = [];
      let currentStatsObj: WeeklyStats | null = null;

      allStatsSnap.forEach((doc) => {
        const data = doc.data();
        const entry: HistoryEntry = {
          id: doc.id,
          weekId: data.weekId,
          goalHours: data.goalHours,
          completedHours: data.completedHours,
          screenTimeHours: data.screenTimeHours,
          rating: data.rating,
          streakActive: data.streakActive,
          startDate: data.startDate,
          endDate: data.endDate
        };

        if (data.weekId === currentWeekId) {
          currentStatsObj = entry;
        } else {
          formattedHistory.push(entry);
        }
      });
      
      // Sort history
      formattedHistory.sort((a, b) => a.weekId.localeCompare(b.weekId));
      setHistory(formattedHistory);

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

      if (currentStatsObj) {
        // Self-heal check
        if (Math.abs(currentStatsObj.completedHours - actualCompletedHours) > 0.1) {
            currentStatsObj.completedHours = actualCompletedHours;
            // Fire and forget update
            const statsRef = doc(db, 'weeklyStats', `${googleId}_${currentWeekId}`);
            updateDoc(statsRef, { completedHours: actualCompletedHours })
              .catch(err => console.error("Background stat sync failed", err));
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
        
        const statsRef = doc(db, 'weeklyStats', `${googleId}_${currentWeekId}`);
        setDoc(statsRef, {
          userId: googleId,
          ...currentStatsObj
        }).catch(err => console.error("Error creating weekly stats", err));
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
        setFetchError(err.message || "Failed to connect to Firebase.");
    } finally {
        if (!backgroundSync) setIsLoading(false);
    }
  };

  const handleLogin = async (userData: any) => {
    // This is mainly used by the Demo login now, 
    // real Google login is handled by onAuthStateChanged
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
    
    // Create profile if not exists
    const profileRef = doc(db, 'users', userData.googleId);
    try {
      const docSnap = await getDoc(profileRef);
      if (!docSnap.exists()) {
        await setDoc(profileRef, {
            email: userData.email,
            name: userData.name,
            avatarUrl: userData.avatarUrl,
            weeklyGoalHours: 80
        });
      } else {
        const data = docSnap.data();
        if (data.weeklyGoalHours !== 80) {
           setUser(prev => prev ? { ...prev, weeklyGoalHours: data.weeklyGoalHours } : prev);
        }
      }
    } catch (err) {
      console.error("Error checking profile:", err);
    }

    fetchUserData(userData.googleId);
  };

  const handleLogout = () => {
    auth.signOut();
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
    
    // Optimistic UI updates
    const profileRef = doc(db, 'users', user.googleId);
    await updateDoc(profileRef, { weeklyGoalHours: newGoal });
    
    if (stats) {
        setStats({ ...stats, goalHours: newGoal });
        const statsRef = doc(db, 'weeklyStats', `${user.googleId}_${stats.weekId}`);
        await updateDoc(statsRef, { goalHours: newGoal });
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
     const statsRef = doc(db, 'weeklyStats', `${user.googleId}_${stats.weekId}`);
     await updateDoc(statsRef, { completedHours: newCompleted, rating: newRating });
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

     const statsRef = doc(db, 'weeklyStats', `${user.googleId}_${stats.weekId}`);
     await updateDoc(statsRef, { screenTimeHours: newScreenTime, rating: newRating });
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