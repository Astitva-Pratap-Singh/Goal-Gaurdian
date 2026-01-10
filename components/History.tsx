import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  AreaChart,
  Area,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { Icons } from './Icons';
import { HistoryEntry, Task, TaskType } from '../types';

interface HistoryProps {
  history: HistoryEntry[];
  tasks: Task[];
}

// Helper to calculate ISO Week ID (Matches App.tsx logic)
const getWeekIdFromTimestamp = (timestamp: number) => {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export const History: React.FC<HistoryProps> = ({ history, tasks }) => {
  const [expandedWeekId, setExpandedWeekId] = useState<string | null>(null);

  // 1. Sort history chronologically (Oldest -> Newest) using robust numeric parsing
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const partsA = a.weekId.split('-W');
      const partsB = b.weekId.split('-W');
      
      const yearA = parseInt(partsA[0], 10);
      const weekA = parseInt(partsA[1], 10);
      const yearB = parseInt(partsB[0], 10);
      const weekB = parseInt(partsB[1], 10);

      if (yearA !== yearB) return yearA - yearB;
      return weekA - weekB;
    });
  }, [history]);

  // Lifetime Stats Calculation
  const totalCompleted = sortedHistory.reduce((acc, curr) => acc + curr.completedHours, 0);
  const avgRating = sortedHistory.length > 0 
    ? (sortedHistory.reduce((acc, curr) => acc + curr.rating, 0) / sortedHistory.length).toFixed(1) 
    : "0.0";

  const calculateBestStreak = (entries: HistoryEntry[]) => {
    let maxStreak = 0;
    let currentStreak = 0;
    
    entries.forEach(entry => {
        if (entry.completedHours >= entry.goalHours) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
    });
    return maxStreak;
  };

  const bestStreak = calculateBestStreak(sortedHistory);
  const avgScreenTime = sortedHistory.length > 0 
    ? (sortedHistory.reduce((acc, curr) => acc + curr.screenTimeHours, 0) / sortedHistory.length).toFixed(1) 
    : "0.0";

  // Pagination Logic (Cluster of 4 weeks)
  const CHUNK_SIZE = 4;
  const [page, setPage] = useState(0); 
  
  const totalItems = sortedHistory.length;
  const totalPages = Math.ceil(totalItems / CHUNK_SIZE) || 1;

  const endIndex = totalItems - (page * CHUNK_SIZE);
  const startIndex = Math.max(0, endIndex - CHUNK_SIZE);
  
  const visibleHistory = sortedHistory.slice(startIndex, endIndex);
  const tableHistory = [...visibleHistory].reverse();

  const handleOlder = () => {
    if (page < totalPages - 1) setPage(p => p + 1);
  };

  const handleNewer = () => {
    if (page > 0) setPage(p => p - 1);
  };

  const toggleWeekExpansion = (weekId: string) => {
      setExpandedWeekId(prev => prev === weekId ? null : weekId);
  };

  // Helper to get tasks for a specific week entry
  const getTasksForWeek = (entry: HistoryEntry) => {
      return tasks.filter(t => {
          if (!t.completedAt) return false;
          // Use robust ID matching instead of fragile Date string parsing
          return getWeekIdFromTimestamp(t.completedAt) === entry.weekId;
      });
  };

  // Helper for Left Chart (Daily Focus Trends: Study vs Work)
  const getDailyFocusData = (entry: HistoryEntry) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map(day => ({
        day,
        study: 0,
        work: 0
    }));

    const weekTasks = getTasksForWeek(entry);
    
    weekTasks.forEach(task => {
        if (!task.completedAt) return;
        const date = new Date(task.completedAt);
        // Adjust for Monday start (0=Mon, ... 6=Sun)
        let dayIndex = date.getDay() - 1;
        if (dayIndex === -1) dayIndex = 6;
        
        if (data[dayIndex]) {
            if (task.type === TaskType.STUDY) {
                data[dayIndex].study += task.durationHours;
            } else {
                data[dayIndex].work += task.durationHours;
            }
        }
    });

    return data;
  };

  // Helper for Right Chart (Daily Activity Trends: Productivity vs Screen Time)
  const getDailyTrendData = (entry: HistoryEntry) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // Use average screen time (Total / 7) as we don't have daily storage yet
    const avgDailyScreenTime = parseFloat((entry.screenTimeHours / 7).toFixed(1));
    
    const data = days.map(day => ({
        day,
        productivity: 0,
        screentime: avgDailyScreenTime
    }));

    const weekTasks = getTasksForWeek(entry);
    
    weekTasks.forEach(task => {
        if (!task.completedAt) return;
        const date = new Date(task.completedAt);
        // Adjust for Monday start (0=Mon, ... 6=Sun)
        let dayIndex = date.getDay() - 1;
        if (dayIndex === -1) dayIndex = 6;
        
        if (data[dayIndex]) {
            data[dayIndex].productivity += task.durationHours;
        }
    });

    return data;
  };

  const rangeLabel = visibleHistory.length > 0 
    ? `${visibleHistory[0].weekId} — ${visibleHistory[visibleHistory.length - 1].weekId}`
    : "No Data";

  return (
    <div className="space-y-8 pb-20 md:pb-0">
       <header className="mb-6">
          <h2 className="text-3xl font-bold text-white mb-1">Performance History</h2>
          <p className="text-slate-400">Track your productivity trends and screen time over weeks.</p>
       </header>

       {/* Summary Cards */}
       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
             <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-900/30 rounded-lg">
                   <Icons.CheckCircle className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="text-slate-400 text-sm">Total Hours</span>
             </div>
             <p className="text-2xl font-bold text-white">{totalCompleted.toFixed(1)}h</p>
          </div>
          
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
             <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-yellow-900/30 rounded-lg">
                   <Icons.Target className="w-5 h-5 text-yellow-400" />
                </div>
                <span className="text-slate-400 text-sm">Avg Rating</span>
             </div>
             <p className="text-2xl font-bold text-white">{avgRating}/10</p>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
             <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-900/30 rounded-lg">
                   <Icons.Fire className="w-5 h-5 text-orange-400" />
                </div>
                <span className="text-slate-400 text-sm">Best Streak</span>
             </div>
             <p className="text-2xl font-bold text-white">{bestStreak} Weeks</p>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
             <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-red-900/30 rounded-lg">
                   <Icons.Smartphone className="w-5 h-5 text-red-400" />
                </div>
                <span className="text-slate-400 text-sm">Avg Screen Time</span>
             </div>
             <p className="text-2xl font-bold text-white">
                {avgScreenTime}h
             </p>
          </div>
       </div>

       {/* Pagination Controls */}
       <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
          <button 
            onClick={handleOlder}
            disabled={page >= totalPages - 1}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${page >= totalPages - 1 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
             <Icons.ChevronLeft className="w-4 h-4" />
             Older
          </button>
          
          <span className="text-slate-400 text-sm font-mono bg-slate-950 px-3 py-1 rounded border border-slate-800">
             {rangeLabel}
          </span>

          <button 
            onClick={handleNewer}
            disabled={page === 0}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${page === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
             Newer
             <Icons.ChevronRight className="w-4 h-4" />
          </button>
       </div>

       {/* Charts */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Completion vs Goal */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
             <h3 className="text-lg font-semibold text-white mb-6">Weekly Goal Completion</h3>
             <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={visibleHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="weekId" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                         cursor={{fill: '#1e293b'}} 
                         contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                      />
                      <Bar dataKey="completedHours" name="Completed" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                      <Bar dataKey="goalHours" name="Goal" fill="#334155" radius={[4, 4, 0, 0]} barSize={20} />
                   </BarChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Screen Time Trend */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
             <h3 className="text-lg font-semibold text-white mb-6">Screen Time Trends</h3>
             <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={visibleHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="weekId" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                         contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                      />
                      <ReferenceLine y={21} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Limit', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
                      <Area type="monotone" dataKey="screenTimeHours" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} strokeWidth={2} />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>
       </div>

       {/* History List (Paginated with Expandable Rows) */}
       <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
             <h3 className="text-lg font-semibold text-white">Week Details</h3>
             <span className="text-xs text-slate-500">Showing 4 weeks per view</span>
          </div>
          <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-400 text-xs uppercase">
                   <tr>
                      <th className="px-6 py-4 font-medium">Week</th>
                      <th className="px-6 py-4 font-medium">Dates</th>
                      <th className="px-6 py-4 font-medium">Hours Completed</th>
                      <th className="px-6 py-4 font-medium">Screen Time</th>
                      <th className="px-6 py-4 font-medium">Rating</th>
                      <th className="px-6 py-4 font-medium w-10"></th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                   {tableHistory.map((entry) => (
                      <React.Fragment key={entry.id}>
                          <tr 
                            className={`transition-colors cursor-pointer ${expandedWeekId === entry.weekId ? 'bg-slate-800/80' : 'hover:bg-slate-800/50'}`}
                            onClick={() => toggleWeekExpansion(entry.weekId)}
                          >
                             <td className="px-6 py-4 text-slate-300 font-medium">{entry.weekId}</td>
                             <td className="px-6 py-4 text-slate-500 text-sm">{entry.startDate} - {entry.endDate}</td>
                             <td className="px-6 py-4 text-slate-300">
                                <span className={entry.completedHours >= entry.goalHours ? "text-green-400" : ""}>
                                   {entry.completedHours.toFixed(1)}
                                </span>
                                <span className="text-slate-600 text-xs"> / {entry.goalHours}h</span>
                             </td>
                             <td className="px-6 py-4 text-slate-300">
                                <span className={entry.screenTimeHours > 21 ? "text-red-400" : "text-slate-300"}>
                                   {entry.screenTimeHours.toFixed(1)}h
                                </span>
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                   <span className={`font-bold ${entry.rating >= 7 ? 'text-green-400' : entry.rating >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>
                                      {entry.rating}
                                    </span>
                                </div>
                             </td>
                             <td className="px-6 py-4 text-slate-500">
                                {expandedWeekId === entry.weekId ? <Icons.ChevronLeft className="-rotate-90 w-4 h-4"/> : <Icons.ChevronLeft className="rotate-180 w-4 h-4"/>}
                             </td>
                          </tr>
                          
                          {/* Expanded Details Row */}
                          {expandedWeekId === entry.weekId && (
                             <tr className="bg-slate-950/30">
                                <td colSpan={6} className="px-6 py-6 border-t border-b border-slate-800">
                                    <div className="flex flex-col gap-6">
                                        
                                        {/* ROW 1: Charts (Side by Side) */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            
                                            {/* Left: Focus Distribution (Line) */}
                                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <Icons.Target className="w-4 h-4" /> Daily Focus Breakdown
                                                </h4>
                                                <div className="h-64">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={getDailyFocusData(entry)}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                                            <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                                            <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                                            <Tooltip 
                                                                cursor={{stroke: '#334155'}} 
                                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                                                formatter={(value: number) => [`${value.toFixed(1)} hrs`]}
                                                            />
                                                            <Legend />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="study" 
                                                                name="Study" 
                                                                stroke="#818cf8" 
                                                                strokeWidth={3} 
                                                                dot={{ fill: '#818cf8', r: 4 }} 
                                                            />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="work" 
                                                                name="Work" 
                                                                stroke="#2dd4bf" 
                                                                strokeWidth={3} 
                                                                dot={{ fill: '#2dd4bf', r: 4 }} 
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>

                                            {/* Right: Daily Trends (Line Chart) */}
                                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <Icons.BarChart className="w-4 h-4" /> Daily Activity Trends
                                                </h4>
                                                <div className="h-64">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={getDailyTrendData(entry)}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                                            <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                                            <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                                            <Tooltip 
                                                                cursor={{stroke: '#334155'}} 
                                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                                                                formatter={(value: number) => [`${value.toFixed(1)} hrs`]}
                                                            />
                                                            <Legend />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="productivity" 
                                                                name="Productivity" 
                                                                stroke="#818cf8" 
                                                                strokeWidth={3} 
                                                                dot={{ fill: '#818cf8', r: 4 }} 
                                                            />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="screentime" 
                                                                name="Screen Time (Avg)" 
                                                                stroke="#f43f5e" 
                                                                strokeWidth={3} 
                                                                strokeDasharray="5 5"
                                                                dot={false} 
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ROW 2: Task List (Full Width) */}
                                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <Icons.CheckCircle className="w-4 h-4" /> Completed Tasks
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {getTasksForWeek(entry).length > 0 ? (
                                                    getTasksForWeek(entry).map(task => (
                                                        <div key={task.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 flex items-start gap-3 hover:border-slate-700 transition-colors">
                                                            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${task.type === TaskType.STUDY ? 'bg-indigo-500' : 'bg-teal-500'}`}></div>
                                                            <div className="overflow-hidden min-w-0">
                                                                <p className="text-slate-200 text-sm font-medium truncate" title={task.title}>{task.title}</p>
                                                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                                    <span className="flex items-center gap-1"><Icons.Clock className="w-3 h-3"/> {task.durationHours}h</span>
                                                                    <span>•</span>
                                                                    <span>{new Date(task.completedAt!).toLocaleDateString()}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="col-span-full text-center py-8 text-slate-500 border-dashed border border-slate-800 rounded-lg">
                                                        <Icons.LogOut className="w-6 h-6 mx-auto mb-2 opacity-50" />
                                                        <p className="text-sm">No tasks logged for this week.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                </td>
                             </tr>
                          )}
                      </React.Fragment>
                   ))}
                   {visibleHistory.length === 0 && (
                      <tr>
                         <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                            No history data available for this period.
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
};