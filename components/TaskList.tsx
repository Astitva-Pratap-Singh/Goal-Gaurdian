import React, { useState, useMemo, useRef } from 'react';
import { Icons } from './Icons';
import { Task, TaskType, VerificationStatus, UserProfile } from '../types';
import { verifyTaskImage } from '../services/geminiService';

interface TaskListProps {
  tasks: Task[];
  user: UserProfile;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  updateCompletedHours: (hours: number) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, user, setTasks, updateCompletedHours }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // New/Edit Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>(TaskType.WORK);
  const [newTaskDuration, setNewTaskDuration] = useState<number>(1);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Daily Limit Calculation
  const dailyLimit = user.weeklyGoalHours / 7;

  // --- MOTIVATIONAL QUOTES FOR EMPTY STATE ---
  const quotes = [
      { text: "Discipline is doing what needs to be done, even if you don't want to.", icon: Icons.Target, color: "text-red-400" },
      { text: "Flow state is the ultimate high. Build the walls to protect it.", icon: Icons.Fire, color: "text-orange-400" },
      { text: "Hard work beats talent when talent doesn't work hard.", icon: Icons.BarChart, color: "text-indigo-400" },
      { text: "Consistency is the key to breakthrough. Show up.", icon: Icons.Clock, color: "text-teal-400" },
      { text: "Your future is created by what you do today, not tomorrow.", icon: Icons.Layout, color: "text-slate-400" }
  ];

  const randomQuote = useMemo(() => {
      return quotes[Math.floor(Math.random() * quotes.length)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // --- FILTER TASKS FOR "RECENT VIEW" (Last 7 Days) ---
  const visibleTasks = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return tasks.filter(t => {
        const createdAt = new Date(t.createdAt);
        const completedAt = t.completedAt ? new Date(t.completedAt) : null;
        
        // Task is visible if it was created within the last 7 days
        // OR if it was completed within the last 7 days
        return createdAt >= sevenDaysAgo || (completedAt && completedAt >= sevenDaysAgo);
    });
  }, [tasks]);
  
  const todayTasks = useMemo(() => {
    const todayStr = new Date().toDateString();
    return tasks.filter(t => {
        const createdToday = new Date(t.createdAt).toDateString() === todayStr;
        const completedToday = t.completedAt ? new Date(t.completedAt).toDateString() === todayStr : false;
        return (createdToday || completedToday) && t.status !== VerificationStatus.REJECTED;
    });
  }, [tasks]);

  const todayUsed = todayTasks.reduce((acc, t) => acc + t.durationHours, 0);

  const formatTimeAgo = (timestamp: number | string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    
    const intervals = [
        { label: 'd', seconds: 86400 },
        { label: 'hr', seconds: 3600 },
        { label: 'min', seconds: 60 }
    ];
    
    for (const i of intervals) {
        const count = Math.floor(seconds / i.seconds);
        if (count >= 1) return `${count}${i.label} ago`;
    }
    return 'just now';
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setNewTaskTitle(task.title);
    setNewTaskDesc(task.description || '');
    setNewTaskType(task.type);
    setNewTaskDuration(task.durationHours);
    setEditingTaskId(task.id);
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!newTaskTitle || newTaskDuration <= 0) return;

    if (editingTaskId) {
        // UPDATE EXISTING TASK
        const updatedTask = tasks.find(t => t.id === editingTaskId);
        if (!updatedTask) return;
        
        const finalTask = {
            ...updatedTask,
            title: newTaskTitle,
            description: newTaskDesc,
            type: newTaskType,
            durationHours: newTaskDuration
        };

        setTasks(prev => prev.map(t => t.id === editingTaskId ? finalTask : t));
        setIsModalOpen(false);
        resetForm();

        try {
          await fetch(`/api/users/${user.googleId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalTask)
          });
        } catch (error) {
            console.error("Error updating task", error);
            alert("Failed to update task.");
        }

    } else {
        // CREATE NEW TASK
        const tempId = crypto.randomUUID();
        const newTask: Task = {
            id: tempId,
            title: newTaskTitle,
            description: newTaskDesc,
            type: newTaskType,
            durationHours: newTaskDuration,
            createdAt: Date.now(),
            status: VerificationStatus.PENDING
        };

        setTasks(prev => [newTask, ...prev]);
        setIsModalOpen(false);
        resetForm();

        try {
          await fetch(`/api/users/${user.googleId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask)
          });
        } catch (error: any) {
            console.error("Error creating task", error);
            setTasks(prev => prev.filter(t => t.id !== tempId));
            alert(`Failed to save task: ${error.message}`);
        }
    }
  };

  const resetForm = () => {
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskDuration(1);
    setNewTaskType(TaskType.WORK);
    setEditingTaskId(null);
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedTaskIds.size === visibleTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(visibleTasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    if (!window.confirm(`Remove ${selectedTaskIds.size} selected task(s)?`)) return;

    let hoursToDeduct = 0;
    const tasksToDelete = tasks.filter(t => selectedTaskIds.has(t.id));
    
    tasksToDelete.forEach(t => {
      if (t.status === VerificationStatus.VERIFIED) {
        hoursToDeduct += t.durationHours;
      }
    });

    if (hoursToDeduct > 0) {
      updateCompletedHours(-hoursToDeduct);
    }

    setTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
    
    try {
      await Promise.all(
        Array.from(selectedTaskIds).map(taskId => 
          fetch(`/api/users/${user.googleId}/tasks/${taskId}`, { method: 'DELETE' })
        )
      );
    } catch (error) {
      console.error("Error deleting tasks", error);
    }

    setSelectedTaskIds(new Set());
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    if (!window.confirm("Remove this task?")) return;

    if (taskToDelete.status === VerificationStatus.VERIFIED) {
      updateCompletedHours(-taskToDelete.durationHours);
    }

    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await fetch(`/api/users/${user.googleId}/tasks/${taskId}`, { method: 'DELETE' });
    } catch (error) {
      console.error("Error deleting task", error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, task: Task) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const mimeType = base64String.split(';')[0].split(':')[1];
        const base64Data = base64String.split(',')[1];
        submitVerification(task, base64Data, mimeType);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitVerification = async (task: Task, base64Image: string, mimeType: string) => {
    setIsVerifying(true);
    const verifyingTask = { ...task, status: VerificationStatus.VERIFYING };
    setTasks(prev => prev.map(t => t.id === task.id ? verifyingTask : t));
    
    try {
      const result = await verifyTaskImage(task.title, task.description, base64Image, mimeType);
      const finalStatus = result.verified ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;
      
      const updatedTask: Task = {
        ...task,
        status: finalStatus,
        completedAt: result.verified ? Date.now() : undefined,
        rejectionReason: result.verified ? undefined : result.reason
      };
      
      setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
      if (result.verified) updateCompletedHours(task.durationHours);
      
      await fetch(`/api/users/${user.googleId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask)
      });
    } catch (error) {
      console.error("Verification error", error);
      alert("Verification failed.");
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="pb-20 md:pb-0 h-full overflow-y-auto custom-scrollbar pr-2">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Recent Tasks</h2>
          <p className="text-slate-400 text-sm">
             Today&apos;s Load: <span className={`${todayUsed > dailyLimit ? 'text-red-400' : 'text-indigo-400'}`}>{todayUsed.toFixed(1)}h</span> / {dailyLimit.toFixed(1)}h limit
          </p>
        </div>
        <div className="flex items-center gap-3">
          {visibleTasks.length > 0 && (
            <button 
              onClick={handleSelectAll}
              className="text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors px-2"
            >
              {selectedTaskIds.size === visibleTasks.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          {selectedTaskIds.size > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium"
            >
              <Icons.Trash className="w-4 h-4" />
              Delete ({selectedTaskIds.size})
            </button>
          )}
          <button 
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-lg shadow-indigo-900/20"
          >
            <Icons.Plus className="w-5 h-5" />
            Add Task
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {visibleTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <randomQuote.icon className={`w-16 h-16 mb-6 ${randomQuote.color} opacity-60`} />
                <h3 className="text-lg font-medium text-slate-300 max-w-md leading-relaxed">
                  &quot;{randomQuote.text}&quot;
                </h3>
            </div>
        )}

        {visibleTasks.map(task => (
          <div key={task.id} className={`bg-slate-900 border ${selectedTaskIds.has(task.id) ? 'border-indigo-500/50 bg-indigo-900/10' : task.status === VerificationStatus.VERIFIED ? 'border-green-900/30 bg-green-900/5' : task.status === VerificationStatus.REJECTED ? 'border-red-900/30' : 'border-slate-800'} rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-slate-700 group relative`}>
            
            <div className="absolute top-5 left-5">
              <input 
                type="checkbox" 
                checked={selectedTaskIds.has(task.id)}
                onChange={() => toggleTaskSelection(task.id)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
              />
            </div>

            {task.status !== VerificationStatus.VERIFIED && task.status !== VerificationStatus.VERIFYING && (
                <button 
                    onClick={() => openEditModal(task)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-indigo-400 p-1 rounded hover:bg-slate-800 transition-colors"
                    title="Edit Task"
                >
                    <Icons.Edit className="w-4 h-4" />
                </button>
            )}

            <div className="flex-1 pl-8">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${task.type === TaskType.STUDY ? 'bg-indigo-950 text-indigo-400' : 'bg-teal-950 text-teal-400'}`}>
                  {task.type === TaskType.STUDY ? 'Study' : 'Work'}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Icons.Clock className="w-3 h-3" /> {task.durationHours}h
                </span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs text-slate-500">{formatTimeAgo(task.createdAt)}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-100 pr-8">{task.title}</h3>
              {task.description && <p className="text-slate-400 text-sm mt-1">{task.description}</p>}
              {task.status === VerificationStatus.REJECTED && (
                <p className="text-xs text-red-400 mt-2 flex items-center gap-1 bg-red-950/20 p-2 rounded-lg border border-red-900/20">
                  <Icons.Shield className="w-3 h-3" /> {task.rejectionReason}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
               {task.status === VerificationStatus.VERIFIED ? (
                 <div className="flex items-center gap-2 text-green-400 font-bold text-sm bg-green-950/30 px-4 py-2 rounded-xl border border-green-900/30">
                    <Icons.CheckCircle className="w-4 h-4" /> Done
                 </div>
               ) : (
                 <div className="flex items-center gap-2 w-full">
                    <label className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                      task.status === VerificationStatus.VERIFYING 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/20'
                    }`}>
                        <input 
                          type="file" 
                          className="hidden" 
                          disabled={isVerifying || task.status === VerificationStatus.VERIFYING}
                          onChange={(e) => handleImageUpload(e, task)}
                          accept="image/*"
                        />
                        {task.status === VerificationStatus.VERIFYING ? (
                          <><Icons.Loader className="w-4 h-4 animate-spin" /> Verifying</>
                        ) : (
                          <><Icons.CheckCircle className="w-4 h-4" /> Verify & Done</>
                        )}
                    </label>
                 </div>
               )}
               <button 
                onClick={() => handleDeleteTask(task.id)}
                className="p-2.5 text-slate-600 hover:text-red-400 hover:bg-red-950/20 rounded-xl transition-all"
               >
                <Icons.Trash className="w-5 h-5" />
               </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">{editingTaskId ? 'Edit Task' : 'New Task'}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Title</label>
                <input 
                  type="text" 
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g., Complete Chapter 4 Math"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <textarea 
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 h-24 resize-none"
                  placeholder="Describe your task..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-sm text-slate-400 mb-1">Type</label>
                   <select 
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value as TaskType)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                   >
                     <option value={TaskType.STUDY}>Study</option>
                     <option value={TaskType.WORK}>Work</option>
                   </select>
                </div>
                <div>
                   <label className="block text-sm text-slate-400 mb-1">Duration (Hours)</label>
                   <input 
                    type="number" 
                    min="0.5"
                    step="0.5"
                    value={newTaskDuration}
                    onChange={(e) => setNewTaskDuration(parseFloat(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                   />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTask}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                {editingTaskId ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
