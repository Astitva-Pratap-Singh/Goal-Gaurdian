import React from 'react';
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
  const totalCompleted = history.reduce((acc, curr) => acc + curr.completedHours, 0);
  const avgRating = history.length > 0 
    ? (history.reduce((acc, curr) => acc + curr.rating, 0) / history.length).toFixed(1) 
    : "0.0";
  
  // Sort history by date for charts
  const sortedHistory = [...history].sort((a, b) => a.weekId.localeCompare(b.weekId));

  const calculateBestStreak = (entries: HistoryEntry[]) => {
    let maxStreak = 0;
    let currentStreak = 0;
    
    entries.forEach(entry => {
        // A week counts if goal is met. 
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
                {(history.length > 0 ? history.reduce((acc, curr) => acc + curr.screenTimeHours, 0) / history.length : 0).toFixed(1)}h
             </p>
          </div>
       </div>

       {/* Charts */}
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Completion vs Goal */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
             <h3 className="text-lg font-semibold text-white mb-6">Weekly Goal Completion</h3>
             <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={sortedHistory}>
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
                   <AreaChart data={sortedHistory}>
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

       {/* History List */}
       <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800">
             <h3 className="text-lg font-semibold text-white">Past Weeks</h3>
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
                   {[...sortedHistory].reverse().map((entry) => (
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
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
};