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

  // Verification Modal State
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [taskToVerify, setTaskToVerify] = useState<Task | null>(null);
  const [verificationImage, setVerificationImage] = useState<string | null>(null);
  const [verificationMimeType, setVerificationMimeType] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // --- FILTER TASKS FOR "DAILY VIEW" ---
  // Show task if: Created TODAY OR Completed TODAY
  const visibleTasks = useMemo(() => {
    const todayStr = new Date().toDateString();
    return tasks.filter(t => {
        const createdToday = new Date(t.createdAt).toDateString() === todayStr;
        const completedToday = t.completedAt ? new Date(t.completedAt).toDateString() === todayStr : false;
        
        // We show tasks created today (even if pending) OR tasks completed today
        return createdToday || completedToday;
    });
  }, [tasks]);
  
  // Calculate today's load based on the visible daily tasks
  const todayTasks = visibleTasks.filter(t => t.status !== VerificationStatus.REJECTED);
  const todayUsed = todayTasks.reduce((acc, t) => acc + t.durationHours, 0);

  const formatTimeAgo = (timestamp: number | string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'created just now';

    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'week', seconds: 604800 },
        { label: 'day', seconds: 86400 },
        { label: 'hr', seconds: 3600 },
        { label: 'min', seconds: 60 }
    ];

    for (const i of intervals) {
        const count = Math.floor(seconds / i.seconds);
        if (count >= 1) {
            return `created ${count} ${i.label}${count !== 1 ? 's' : ''} ago`;
        }
    }
    return 'created just now';
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setNewTaskTitle(task.title);
    setNewTaskDesc(task.description);
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

        // Optimistic Update
        setTasks(prev => [newTask, ...prev]);
        setIsModalOpen(false);
        resetForm();

        // DB Insert
        try {
          await fetch(`/api/users/${user.googleId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask)
          });
        } catch (error: any) {
            console.error("Error creating task", error);
            setTasks(prev => prev.filter(t => t.id !== tempId));
            alert(`Failed to save task to database: ${error.message}`);
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

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to remove this task? This cannot be undone.")) {
      return;
    }

    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await fetch(`/api/users/${user.googleId}/tasks/${taskId}`, { method: 'DELETE' });
    } catch (error) {
      console.error("Error deleting task", error);
      alert("Failed to delete task from server.");
    }
  };

  const openVerifyModal = (task: Task) => {
    setTaskToVerify(task);
    setVerificationImage(null);
    setVerificationMimeType(null);
    setIsVerifyModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const mimeType = base64String.split(';')[0].split(':')[1];
        const base64Data = base64String.split(',')[1];
        
        setVerificationImage(base64Data);
        setVerificationMimeType(mimeType);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitVerification = async () => {
    if (!taskToVerify || !verificationImage || !verificationMimeType) return;
    
    setIsVerifying(true);
    
    // Set task status to verifying
    const verifyingTask = { ...taskToVerify, status: VerificationStatus.VERIFYING };
    setTasks(prev => prev.map(t => t.id === taskToVerify.id ? verifyingTask : t));
    
    try {
      const result = await verifyTaskImage(
        taskToVerify.title,
        taskToVerify.description,
        verificationImage,
        verificationMimeType
      );
      
      const finalStatus = result.verified ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED;
      
      const updatedTask = {
        ...taskToVerify,
        status: finalStatus,
        completedAt: result.verified ? Date.now() : undefined,
        rejectionReason: result.verified ? undefined : result.reason
      };
      
      setTasks(prev => prev.map(t => t.id === taskToVerify.id ? updatedTask : t));
      
      if (result.verified) {
        updateCompletedHours(taskToVerify.durationHours);
      }
      
      // DB Update (We don't send the image to DB, only the task data)
      await fetch(`/api/users/${user.googleId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask)
      });
      
    } catch (error) {
      console.error("Verification error", error);
      alert("Verification failed due to an error.");
      setTasks(prev => prev.map(t => t.id === taskToVerify.id ? taskToVerify : t));
    } finally {
      setIsVerifying(false);
      setIsVerifyModalOpen(false);
      setTaskToVerify(null);
    }
  };

  return (
    <div className="pb-20 md:pb-0 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Today&apos;s Tasks</h2>
          <p className="text-slate-400 text-sm">
             Today&apos;s Load: <span className={`${todayUsed > dailyLimit ? 'text-red-400' : 'text-indigo-400'}`}>{todayUsed.toFixed(1)}h</span> / {dailyLimit.toFixed(1)}h limit
          </p>
        </div>
        <button 
          onClick={openCreateModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-lg shadow-indigo-900/20"
        >
          <Icons.Plus className="w-5 h-5" />
          Add Task
        </button>
      </div>

      <div className="space-y-4">
        {visibleTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
                <randomQuote.icon className={`w-20 h-20 mb-6 ${randomQuote.color} opacity-80`} />
                <h3 className="text-xl font-medium text-white max-w-lg leading-relaxed">
                  &quot;{randomQuote.text}&quot;
                </h3>
                <p className="text-slate-600 mt-4 text-sm">Start your day by adding a new task.</p>
            </div>
        )}

        {visibleTasks.map(task => (
          <div key={task.id} className={`bg-slate-900 border ${task.status === VerificationStatus.VERIFIED ? 'border-green-900/50 bg-green-900/5' : task.status === VerificationStatus.REJECTED ? 'border-red-900/50' : 'border-slate-800'} rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-slate-700 group relative`}>
            
            {task.status !== VerificationStatus.VERIFIED && task.status !== VerificationStatus.VERIFYING && (
                <button 
                    onClick={() => openEditModal(task)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-indigo-400 p-1 rounded hover:bg-slate-800 transition-colors"
                    title="Edit Task"
                >
                    <Icons.Edit className="w-4 h-4" />
                </button>
            )}

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded border ${task.type === TaskType.STUDY ? 'bg-indigo-950/50 border-indigo-900 text-indigo-400' : 'bg-teal-950/50 border-teal-900 text-teal-400'}`}>
                  {task.type}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Icons.Clock className="w-3 h-3" /> {task.durationHours}h
                </span>
                
                <span className="text-xs text-slate-600 hidden sm:inline">•</span>
                <span className="text-xs text-slate-500">
                  {formatTimeAgo(task.createdAt)}
                </span>

                {task.status === VerificationStatus.REJECTED && (
                    <span className="text-xs text-red-400 bg-red-950/30 px-2 rounded">Rejected: {task.rejectionReason}</span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-100 pr-8">{task.title}</h3>
              <p className="text-slate-400 text-sm mt-1">{task.description}</p>
            </div>

            <div className="w-full md:w-auto flex justify-end mt-4 md:mt-0">
               {task.status === VerificationStatus.VERIFIED ? (
                 <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-green-500 px-4 py-2 bg-green-950/20 rounded-lg border border-green-900/50">
                       <Icons.CheckCircle className="w-5 h-5" />
                       <span className="font-medium">Completed</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors border border-transparent hover:border-red-900/50"
                      title="Remove Task"
                    >
                      <Icons.Trash className="w-5 h-5" />
                    </button>
                 </div>
               ) : task.status === VerificationStatus.VERIFYING ? (
                 <div className="flex items-center gap-2 text-indigo-400 px-4 py-2 bg-indigo-950/20 rounded-lg border border-indigo-900/50">
                    <Icons.Loader className="w-5 h-5 animate-spin" />
                    <span className="font-medium">Verifying...</span>
                 </div>
               ) : (
                 <div className="flex items-center gap-2 w-full md:w-auto">
                    <button 
                        onClick={() => openVerifyModal(task)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg border border-indigo-500 transition-colors"
                    >
                        <Icons.CheckCircle className="w-4 h-4" />
                        Verify & Done
                    </button>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors border border-transparent hover:border-red-900/50"
                      title="Remove Task"
                    >
                      <Icons.Trash className="w-5 h-5" />
                    </button>
                 </div>
               )}
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

      {/* Verification Modal */}
      {isVerifyModalOpen && taskToVerify && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Verify Task</h3>
            <p className="text-slate-400 text-sm mb-6">
              Upload an image as proof of completing &quot;{taskToVerify.title}&quot;. Our AI will analyze it to verify your work.
            </p>
            
            <div className="space-y-4">
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${verificationImage ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 hover:border-indigo-500 hover:bg-slate-800'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/jpeg, image/png, image/webp" 
                  className="hidden" 
                />
                
                {verificationImage ? (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mb-3">
                      <Icons.CheckCircle className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-indigo-300 font-medium">Image uploaded</p>
                    <p className="text-xs text-slate-500 mt-1">Click to change</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                      <Icons.Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-300 font-medium">Click to upload proof</p>
                    <p className="text-xs text-slate-500 mt-1">JPEG, PNG, WEBP</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setIsVerifyModalOpen(false)}
                disabled={isVerifying}
                className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={submitVerification}
                disabled={!verificationImage || isVerifying}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Icons.Loader className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Submit Proof'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
