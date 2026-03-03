import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { ScreenTimeUpload } from './components/ScreenTimeUpload';
import { History } from './components/History';
import { DataImport } from './components/DataImport';
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
  limit,
  onSnapshot
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
        // Fetch initial profile data
        fetchUserProfile(firebaseUser.uid);
      } else {
        // User is signed out
        setIsAuthenticated(false);
        setUser(null);
        setStats(null);
        setTasks([]);
        setHistory([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Real-time Data Sync
  useEffect(() => {
    if (!user?.googleId) return;

    const googleId = user.googleId;
    const currentWeekId = getCurrentWeekId();

    // 1. Tasks Listener
    const tasksQuery = query(
      collection(db, 'tasks'), 
      where('userId', '==', googleId)
    );

    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      const formattedTasks: Task[] = [];
      snapshot.forEach((doc) => {
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
          proofImage: data.proofImage
        });
      });
      
      // Sort in memory (descending by createdAt)
      formattedTasks.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      setTasks(formattedTasks);
      setIsLoading(false);

      // Continuous Sync: Ensure Weekly Stats matches verified tasks
      // This handles task deletions, duration updates, and verifications automatically
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

      // Check and update stats if out of sync
      const statsRef = doc(db, 'weeklyStats', `${googleId}_${currentWeekId}`);
      getDoc(statsRef).then(async (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();
              // Only update if difference is significant (floating point tolerance)
              if (Math.abs((data.completedHours || 0) - actualCompletedHours) > 0.1) {
                  console.log(`Syncing stats: DB=${data.completedHours}, Actual=${actualCompletedHours}`);
                  const goal = data.goalHours || 80;
                  const screenTime = data.screenTimeHours || 0;
                  const newRating = await calculateWeeklyRating(actualCompletedHours, goal, screenTime);
                  
                  await updateDoc(statsRef, { 
                      completedHours: actualCompletedHours,
                      rating: newRating
                  });
              }
          }
      }).catch(err => console.error("Error syncing stats with tasks:", err));

    }, (error) => {
      console.error("Error syncing tasks:", error);
      handleSyncError(error);
    });

    // 2. History & Current Stats Listener
    // Note: We listen to all weeklyStats for the user to keep history and current stats in sync
    const statsQuery = query(
      collection(db, 'weeklyStats'),
      where('userId', '==', googleId)
    );

    const unsubStats = onSnapshot(statsQuery, (snapshot) => {
      let formattedHistory: HistoryEntry[] = [];
      let currentStatsObj: WeeklyStats | null = null;

      snapshot.forEach((doc) => {
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

      // Handle Current Stats
      if (currentStatsObj) {
        setStats(currentStatsObj);
      } else {
        // If no current stats exist yet, we might need to create them
        // This is handled by initializeCurrentWeek if needed, or we just wait
        // For now, we'll rely on the profile fetch or manual creation trigger if missing
        // But to be safe, we can init here if we have tasks loaded
        initializeCurrentWeek(googleId, currentUserGoalRef.current);
      }
    }, (error) => {
      console.error("Error syncing stats:", error);
      // Don't block on stats error
    });

    return () => {
      unsubTasks();
      unsubStats();
    };
  }, [user?.googleId]);

  // Ref to keep track of goal for initialization without dependency loop
  const currentUserGoalRef = React.useRef(80);

  const fetchUserProfile = async (googleId: string) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const profileRef = doc(db, 'users', googleId);
      const profileSnap = await getDoc(profileRef);
      
      if (profileSnap.exists()) {
         const data = profileSnap.data();
         const goal = data.weeklyGoalHours || 80;
         currentUserGoalRef.current = goal;
         setUser(prev => prev ? { ...prev, weeklyGoalHours: goal } : null);
      } else {
         // Profile doesn't exist, create it
         await setDoc(profileRef, {
             email: auth.currentUser?.email || '',
             name: auth.currentUser?.displayName || 'User',
             avatarUrl: auth.currentUser?.photoURL || '',
             weeklyGoalHours: 80
         });
      }
    } catch (err: any) {
      console.error("Error fetching profile:", err);
    }
  };

  const initializeCurrentWeek = async (googleId: string, goalHours: number) => {
    // Only create if we are sure it doesn't exist (which we know from the snapshot being empty for this week)
    // But we need to be careful not to infinite loop. 
    // The snapshot listener handles updates. If we write, it will fire again.
    
    // We'll check existence once with a getDoc to be safe before writing
    const currentWeekId = getCurrentWeekId();
    const statsRef = doc(db, 'weeklyStats', `${googleId}_${currentWeekId}`);
    
    try {
      const docSnap = await getDoc(statsRef);
      if (!docSnap.exists()) {
        const now = new Date();
        const currentDay = now.getDay(); 
        const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - distanceToMonday);
        monday.setHours(0, 0, 0, 0);
        const nextMonday = new Date(monday);
        nextMonday.setDate(monday.getDate() + 7);

        const newStats = {
          weekId: currentWeekId,
          startDate: monday.toLocaleDateString(),
          endDate: new Date(nextMonday.getTime() - 1).toLocaleDateString(),
          goalHours: goalHours,
          completedHours: 0,
          screenTimeHours: 0,
          rating: 0,
          streakActive: true,
          userId: googleId
        };
        
        await setDoc(statsRef, newStats);
      }
    } catch (err) {
      console.error("Error initializing week:", err);
    }
  };

  const handleSyncError = (err: any) => {
      if (err.code === 'unavailable') {
        const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unknown';
        setFetchError(`Connection Failed (Code: unavailable).
        
        Troubleshooting Checklist:
        1. Is your internet connection stable?
        2. Is the Project ID correct? (Using: "${projectId.substring(0, 8)}...")
        3. Have you created the Firestore Database in the Firebase Console? (Build -> Firestore Database -> Create Database)
        4. Are you using a VPN or Firewall blocking Firestore?`);
      } else {
        setFetchError(err.message || "Failed to connect to Firebase.");
      }
      setIsLoading(false);
  };

  // Legacy fetchUserData - kept empty or redirected to avoid breaking references if any
  const fetchUserData = async (googleId: string, backgroundSync = false) => {
     // No-op, handled by listeners now
     // We can trigger a profile refresh if needed
     fetchUserProfile(googleId);
  };

  const handleLogin = (userData: any) => {
     // This is just a placeholder now as onAuthStateChanged handles the real logic
     console.log("Login triggered", userData);
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
          {currentView === 'migration' && <DataImport user={user} />}
        </div>
      </main>
    </div>
  );
};

export default App;