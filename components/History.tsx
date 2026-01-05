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
  ReferenceLine
} from 'recharts';
import { Icons } from './Icons';
import { HistoryEntry } from '../types';

interface HistoryProps {
  history: HistoryEntry[];
}

export const History: React.FC<HistoryProps> = ({ history }) => {
  
  // 1. Sort history chronologically (Oldest -> Newest) using robust numeric parsing
  // This ensures '2024-W7' is treated correctly vs '2024-W10' (numeric 7 < 10, whereas string '7' > '1')
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      // Handle potential format variations, though App.tsx ensures padding
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

  // Calculate slice indices
  // We want the chunk to slide from the END of the array (Newest) backwards
  // But within the chunk, preserve the order (Oldest -> Newest) for the graph (Left -> Right)
  const endIndex = totalItems - (page * CHUNK_SIZE);
  const startIndex = Math.max(0, endIndex - CHUNK_SIZE);
  
  // visibleHistory contains [Oldest, ..., Newest] relative to the chunk window
  const visibleHistory = sortedHistory.slice(startIndex, endIndex);

  // Table typically shows Newest at top
  const tableHistory = [...visibleHistory].reverse();

  const handleOlder = () => {
    if (page < totalPages - 1) setPage(p => p + 1);
  };

  const handleNewer = () => {
    if (page > 0) setPage(p => p - 1);
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
                      <ReferenceLine y={14} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Limit', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
                      <Area type="monotone" dataKey="screenTimeHours" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} strokeWidth={2} />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>
       </div>

       {/* History List (Paginated) */}
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
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                   {tableHistory.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-800/50 transition-colors">
                         <td className="px-6 py-4 text-slate-300 font-medium">{entry.weekId}</td>
                         <td className="px-6 py-4 text-slate-500 text-sm">{entry.startDate} - {entry.endDate}</td>
                         <td className="px-6 py-4 text-slate-300">
                            <span className={entry.completedHours >= entry.goalHours ? "text-green-400" : ""}>
                               {entry.completedHours.toFixed(1)}
                            </span>
                            <span className="text-slate-600 text-xs"> / {entry.goalHours}h</span>
                         </td>
                         <td className="px-6 py-4 text-slate-300">
                            <span className={entry.screenTimeHours > 14 ? "text-red-400" : "text-slate-300"}>
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
                      </tr>
                   ))}
                   {visibleHistory.length === 0 && (
                      <tr>
                         <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
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