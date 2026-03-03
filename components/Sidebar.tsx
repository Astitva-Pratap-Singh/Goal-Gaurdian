import React from 'react';
import { Icons } from './Icons';
import { UserProfile } from '../types';

interface SidebarProps {
  user: UserProfile;
  currentView: string;
  setView: (view: string) => void;
  onLogout: () => void;
  onUpdateGoal: (newGoal: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, currentView, setView, onLogout, onUpdateGoal }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Layout },
    { id: 'tasks', label: 'Tasks', icon: Icons.CheckCircle },
    { id: 'screentime', label: 'Screen Time', icon: Icons.Smartphone },
    { id: 'history', label: 'History', icon: Icons.BarChart },
  ];

  const handleGoalClick = () => {
    const newGoal = prompt("Set your weekly hour goal:", user.weeklyGoalHours.toString());
    if (newGoal && !isNaN(Number(newGoal))) {
      onUpdateGoal(Number(newGoal));
    }
  };

  return (
    <div className="fixed bottom-0 w-full md:w-64 md:h-screen bg-slate-900 border-t md:border-t-0 md:border-r border-slate-800 flex md:flex-col justify-between z-50">
      
      {/* Logo Area (Hidden on mobile) */}
      <div className="hidden md:flex flex-col p-6 border-b border-slate-800">
        <div className="flex items-center gap-2 text-indigo-500 mb-6">
          <Icons.Shield className="w-8 h-8" />
          <h1 className="text-xl font-bold tracking-wider text-white">Goal Guardian</h1>
        </div>
        
        <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
          <img src={user.avatarUrl} alt="User" className="w-10 h-10 rounded-full border-2 border-indigo-500" />
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <button 
              onClick={handleGoalClick}
              className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline text-left"
            >
              Target: {user.weeklyGoalHours}h (Edit)
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex md:flex-col justify-around md:justify-start p-2 md:p-4 gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`flex flex-col md:flex-row items-center md:gap-3 p-2 md:px-4 md:py-3 rounded-lg transition-all ${
              currentView === item.id
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <item.icon className="w-6 h-6 md:w-5 md:h-5" />
            <span className="text-xs md:text-sm font-medium mt-1 md:mt-0">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div className="hidden md:block p-4 border-t border-slate-800">
        <button 
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
        >
          <Icons.LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
};