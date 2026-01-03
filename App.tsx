import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { TaskList } from './components/TaskList';
import { ScreenTimeUpload } from './components/ScreenTimeUpload';
import { History } from './components/History';
import { Auth } from './components/Auth';
import { UserProfile, WeeklyStats, Task, TaskType, VerificationStatus, HistoryEntry } from './types';
import { calculateWeeklyRating } from './services/geminiService';

const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: 'h1',
    weekId: 'Week 18',
    startDate: 'Apr 29',
    endDate: 'May 05',
    goalHours: 60,
    completedHours: 58.5,
    screenTimeHours: 12.4,
    rating: 9.2,
    streakActive: true
  },
  {
    id: 'h2',
    weekId: 'Week 19',
    startDate: 'May 06',
    endDate: 'May 12',
    goalHours: 70,
    completedHours: 45.0,
    screenTimeHours: 22.1,
    rating: 4.5, // High screen time penalty
    streakActive: false
  },
  {
    id: 'h3',
    weekId: 'Week 20',
    startDate: 'May 13',
    endDate: 'May 19',
    goalHours: 70,
    completedHours: 72.0,
    screenTimeHours: 10.5,
    rating: 9.8,
    streakActive: true
  },
  {
    id: 'h4',
    weekId: 'Week 21',
    startDate: 'May 20',
    endDate: 'May 26',
    goalHours: 80,
    completedHours: 75.5,
    screenTimeHours: 13.0,
    rating: 8.9,
    streakActive: true
  }
];

const INITIAL_STATS: WeeklyStats = {
  weekId: 'Week 22',
  startDate: 'May 27',
  endDate: 'Jun 02',
  goalHours: 80,
  completedHours: 12.5,
  screenTimeHours: 2.1,
  rating: 8.0,
  streakActive: true
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  
  // User State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<WeeklyStats>(INITIAL_STATS);
  const [history, setHistory] = useState<HistoryEntry[]>(MOCK_HISTORY);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Check for existing session
  useEffect(() => {
    const savedUser = localStorage.getItem('focusforge_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (userData: any) => {
    const newUser: UserProfile = {
      name: userData.name,
      email: userData.email,
      avatarUrl: userData.avatarUrl,
      googleId: userData.googleId,
      weeklyGoalHours: 80, // Default goal
      currentStreak: 4
    };
    setUser(newUser);
    localStorage.setItem('focusforge_user', JSON.stringify(newUser));
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('focusforge_user');
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateCompletedHours = async (hoursToAdd: number) => {
     setStats(prev => {
       const newCompleted = prev.completedHours + hoursToAdd;
       return { ...prev, completedHours: newCompleted };
     });
     
     const newRating = await calculateWeeklyRating(
       stats.completedHours + hoursToAdd, 
       stats.goalHours, 
       stats.screenTimeHours
     );
     setStats(prev => ({ ...prev, rating: newRating }));
  };

  const handleScreenTimeSubmit = async (hours: number, image: string) => {
     setStats(prev => ({
       ...prev,
       screenTimeHours: prev.screenTimeHours + hours
     }));
     
     const newRating = await calculateWeeklyRating(
       stats.completedHours, 
       stats.goalHours, 
       stats.screenTimeHours + hours
     );
     setStats(prev => ({ ...prev, rating: newRating }));
  };

  if (!isAuthenticated || !user) {
    return <Auth onLogin={handleLogin} />;
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