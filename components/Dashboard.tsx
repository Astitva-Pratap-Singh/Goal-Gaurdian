import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { Icons } from './Icons';
import { UserProfile, WeeklyStats, Task, TaskType } from '../types';

interface DashboardProps {
  user: UserProfile;
  stats: WeeklyStats;
  tasks: Task[];
}

export const Dashboard: React.FC<DashboardProps> = ({ user, stats, tasks }) => {
  
  const completionPercentage = Math.min(100, (stats.completedHours / stats.goalHours) * 100);
  
  const tasksByType = useMemo(() => {
    const study = tasks.filter(t => t.type === TaskType.STUDY && t.status === 'VERIFIED').reduce((acc, t) => acc + t.durationHours, 0);
    const work = tasks.filter(t => t.type === TaskType.WORK && t.status === 'VERIFIED').reduce((acc, t) => acc + t.durationHours, 0);
    return [
      { name: 'Study', value: study, color: '#818cf8' }, // Indigo 400
      { name: 'Work', value: work, color: '#2dd4bf' }, // Teal 400
    ];
  }, [tasks]);

  const ratingColor = stats.rating >= 7 ? 'text-green-400' : stats.rating >= 4 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Dashboard</h2>
          <p className="text-slate-400">Week Overview • {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 bg-orange-950/30 px-4 py-2 rounded-full border border-orange-900/50">
          <Icons.Fire className="w-5 h-5 text-orange-500 animate-pulse" />
          <span className="font-bold text-orange-400">{user.currentStreak} Week Streak</span>
        </div>
      </header>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Rating Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Icons.Target className="w-24 h-24 text-white" />
          </div>
          <p className="text-slate-400 text-sm font-medium mb-2">Weekly Rating</p>
          <div className="flex items-end gap-2">
            <span className={`text-5xl font-bold ${ratingColor}`}>{stats.rating}</span>
            <span className="text-slate-500 text-lg mb-1">/ 10.0</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Based on tasks vs. screen time</p>
        </div>

        {/* Hours Progress */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
           <p className="text-slate-400 text-sm font-medium mb-4">Goal Progress</p>
           <div className="h-24 flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={[{ value: stats.completedHours }, { value: stats.goalHours - stats.completedHours }]}
                   innerRadius={35}
                   outerRadius={45}
                   startAngle={90}
                   endAngle={-270}
                   dataKey="value"
                   stroke="none"
                 >
                   <Cell fill="#6366f1" />
                   <Cell fill="#1e293b" />
                 </Pie>
                 <text x="50%" y="50%" dy={4} textAnchor="middle" fill="#fff" fontSize={16} fontWeight="bold">
                   {Math.round(completionPercentage)}%
                 </text>
               </PieChart>
             </ResponsiveContainer>
           </div>
           <div className="flex justify-between text-xs text-slate-400 mt-2">
             <span>{stats.completedHours.toFixed(1)}h done</span>
             <span>{stats.goalHours}h goal</span>
           </div>
        </div>

         {/* Screen Time */}
         <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <p className="text-slate-400 text-sm font-medium mb-2">Screen Time</p>
          <div className="flex items-end gap-2 mt-4">
            <span className={`text-4xl font-bold ${stats.screenTimeHours > 14 ? 'text-red-400' : 'text-slate-200'}`}>
              {stats.screenTimeHours.toFixed(1)}
            </span>
            <span className="text-slate-500 text-sm mb-1">hrs</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Submit daily by 11 PM</p>
        </div>

        {/* Task Breakdown */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <p className="text-slate-400 text-sm font-medium mb-4">Focus Areas</p>
          <div className="space-y-3">
             {tasksByType.map((item) => (
               <div key={item.name}>
                 <div className="flex justify-between text-xs text-slate-300 mb-1">
                   <span>{item.name}</span>
                   <span>{item.value.toFixed(1)}h</span>
                 </div>
                 <div className="w-full bg-slate-800 rounded-full h-1.5">
                   <div 
                    className="h-1.5 rounded-full" 
                    style={{ width: `${Math.min(100, (item.value / (stats.completedHours || 1)) * 100)}%`, backgroundColor: item.color }} 
                   />
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
           <h3 className="text-lg font-semibold text-white mb-6">Activity This Week</h3>
           <div className="h-64">
             {/* Mocking weekly data visualization for the 'this week' view */}
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={[
                 { day: 'Mon', hours: 0 }, { day: 'Tue', hours: 0 }, { day: 'Wed', hours: 0 }, 
                 { day: 'Thu', hours: 0 }, { day: 'Fri', hours: 0 }, { day: 'Sat', hours: 0 }, { day: 'Sun', hours: 0 } 
                 // In a real app, populate this from logs
               ]}>
                 <defs>
                   <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#818cf8' }}
                 />
                 <Area type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorHours)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-6">Productivity vs Screen Time</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'This Week', prod: stats.completedHours, screen: stats.screenTimeHours }
                ]}>
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  <Bar dataKey="prod" name="Work" fill="#2dd4bf" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar dataKey="screen" name="Screen" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
        </div>
      </div>
    </div>
  );
};