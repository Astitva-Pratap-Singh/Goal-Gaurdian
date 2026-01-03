import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, Legend } from 'recharts';
import { Icons } from './Icons';
import { UserProfile, WeeklyStats, Task, TaskType } from '../types';

interface DashboardProps {
  user: UserProfile;
  stats: WeeklyStats;
  tasks: Task[];
}

export const Dashboard: React.FC<DashboardProps> = ({ user, stats, tasks }) => {
  
  const completionPercentage = Math.min(100, (stats.completedHours / stats.goalHours) * 100);

  // Determine Current Week Range (Monday to Sunday)
  const { monday, nextMonday } = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sun, 1=Mon...
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const m = new Date(now);
    m.setDate(now.getDate() - distanceToMonday);
    m.setHours(0, 0, 0, 0);
    
    const nm = new Date(m);
    nm.setDate(m.getDate() + 7);
    
    return { monday: m, nextMonday: nm };
  }, []);

  // Filter verified tasks for this week only
  const thisWeekTasks = useMemo(() => {
    return tasks.filter(task => {
        if (task.status !== 'VERIFIED' || !task.completedAt) return false;
        const tDate = new Date(task.completedAt);
        return tDate >= monday && tDate < nextMonday;
    });
  }, [tasks, monday, nextMonday]);

  // Calculate Focus Areas (Study vs Work) for THIS WEEK
  const tasksByType = useMemo(() => {
    const study = thisWeekTasks.filter(t => t.type === TaskType.STUDY).reduce((acc, t) => acc + t.durationHours, 0);
    const work = thisWeekTasks.filter(t => t.type === TaskType.WORK).reduce((acc, t) => acc + t.durationHours, 0);
    return [
      { name: 'Study', value: study, color: '#818cf8' }, // Indigo 400
      { name: 'Work', value: work, color: '#2dd4bf' }, // Teal 400
    ];
  }, [thisWeekTasks]);

  const weeklyStudyHours = tasksByType.find(t => t.name === 'Study')?.value || 0;
  const weeklyWorkHours = tasksByType.find(t => t.name === 'Work')?.value || 0;
  const totalProductivity = weeklyStudyHours + weeklyWorkHours;

  // Calculate Daily Activity for THIS WEEK
  const weeklyActivity = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map(d => ({ day: d, hours: 0 }));

    thisWeekTasks.forEach(task => {
        const tDate = new Date(task.completedAt!);
        const diffTime = tDate.getTime() - monday.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) {
            data[diffDays].hours += task.durationHours;
        }
    });
    return data;
  }, [thisWeekTasks, monday]);

  const ratingColor = stats.rating >= 7 ? 'text-green-400' : stats.rating >= 4 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Dashboard</h2>
          <p className="text-slate-400">Week Overview • {monday.toLocaleDateString()} - {new Date(nextMonday.getTime() - 1).toLocaleDateString()}</p>
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
                   data={[{ value: stats.completedHours }, { value: Math.max(0, stats.goalHours - stats.completedHours) }]}
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

        {/* Task Breakdown (This Week) */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <p className="text-slate-400 text-sm font-medium mb-4">Focus Areas (This Week)</p>
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
                    style={{ width: `${Math.min(100, (item.value / (totalProductivity || 1)) * 100)}%`, backgroundColor: item.color }} 
                   />
                 </div>
               </div>
             ))}
             {totalProductivity === 0 && <p className="text-xs text-slate-500 italic">No verified tasks this week</p>}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800">
           <h3 className="text-lg font-semibold text-white mb-6">Activity This Week</h3>
           <div className="h-64">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={weeklyActivity}>
                 <defs>
                   <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                 <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#818cf8' }}
                    formatter={(value: number) => [`${value.toFixed(1)} hrs`, 'Activity']}
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
                  { 
                    name: 'This Week', 
                    study: weeklyStudyHours, 
                    work: weeklyWorkHours, 
                    screen: stats.screenTimeHours 
                  }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: '#1e293b'}} 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} 
                    formatter={(value: number, name: string) => [`${value.toFixed(1)} hrs`, name === 'study' ? 'Study' : name === 'work' ? 'Work' : 'Screen Time']}
                  />
                  <Legend />
                  <Bar dataKey="study" name="Study" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} barSize={40} />
                  <Bar dataKey="work" name="Work" stackId="a" fill="#2dd4bf" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar dataKey="screen" name="Screen Time" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
        </div>
      </div>
    </div>
  );
};