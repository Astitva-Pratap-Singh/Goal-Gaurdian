import React, { useState, useRef, useMemo } from 'react';
import { Icons } from './Icons';
import { Task, TaskType, VerificationStatus, UserProfile } from '../types';
import { verifyTaskProof } from '../services/geminiService';
import { supabase } from '../services/supabase';
import { uploadToR2 } from '../services/storage';

interface TaskListProps {
  tasks: Task[];
  user: UserProfile;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  updateCompletedHours: (hours: number) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, user, setTasks, updateCompletedHours }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  
  // New/Edit Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>(TaskType.WORK);
  const [newTaskDuration, setNewTaskDuration] = useState<number>(1);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTaskForUpload, setSelectedTaskForUpload] = useState<string | null>(null);

  // Proof Preview State
  const [previewProof, setPreviewProof] = useState<string | null>(null);

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

    // Constraint removed: Users can now add tasks exceeding the daily limit.
    
    if (editingTaskId) {
        // UPDATE EXISTING TASK
        setTasks(prev => prev.map(t => t.id === editingTaskId ? {
            ...t,
            title: newTaskTitle,
            description: newTaskDesc,
            type: newTaskType,
            durationHours: newTaskDuration
        } : t));

        setIsModalOpen(false);
        resetForm();

        const { error } = await supabase.from('tasks').update({
            title: newTaskTitle,
            description: newTaskDesc,
            type: newTaskType,
            duration_hours: newTaskDuration
        }).eq('id', editingTaskId);

        if (error) {
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
        const { data, error } = await supabase.from('tasks').insert({
            user_id: user.googleId,
            title: newTask.title,
            description: newTask.description,
            type: newTask.type,
            duration_hours: newTask.durationHours,
            status: newTask.status,
            created_at: newTask.createdAt 
        }).select();

        // Update with real ID from DB if successful
        if (data && data[0]) {
            setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: data[0].id } : t));
        }
        if (error) {
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
    if (!window.confirm("Are you sure you want to remove this completed task? This cannot be undone.")) {
      return;
    }

    setTasks(prev => prev.filter(t => t.id !== taskId));
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);

    if (error) {
      console.error("Error deleting task", error);
      alert("Failed to delete task from server.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTaskForUpload) return;

    const taskIndex = tasks.findIndex(t => t.id === selectedTaskForUpload);
    if (taskIndex === -1) return;
    const taskToVerify = tasks[taskIndex];

    setVerifyingId(selectedTaskForUpload);
    updateTaskStatus(selectedTaskForUpload, VerificationStatus.VERIFYING);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      
      const result = await verifyTaskProof(taskToVerify, base64String, file.type);
      
      let newStatus = VerificationStatus.PENDING;
      let rejectionReason = "";
      let publicUrl = "";

      if (result.verified) {
         try {
           // Store optimized image (simulated upload)
           publicUrl = await uploadToR2(file, user.googleId, 'tasks');
           newStatus = VerificationStatus.VERIFIED;
           
           setTasks(prev => prev.map(t => 
               t.id === selectedTaskForUpload 
               ? { ...t, status: newStatus, completedAt: Date.now(), proofImage: publicUrl } 
               : t
           ));
           updateCompletedHours(taskToVerify.durationHours);
         } catch (uploadErr) {
           console.error("Storage failed", uploadErr);
           alert("Verification successful, but saving proof failed.");
           newStatus = VerificationStatus.VERIFIED; 
         }
      } else {
         newStatus = VerificationStatus.REJECTED;
         rejectionReason = result.reason || "Verification failed";
         setTasks(prev => prev.map(t => 
             t.id === selectedTaskForUpload 
             ? { ...t, status: newStatus, rejectionReason: rejectionReason } 
             : t
         ));
         alert(`Verification Failed: ${rejectionReason}`);
      }
      
      setVerifyingId(null);
      
      // Use timestamp number for DB compatibility
      const completedAt = result.verified ? Date.now() : null;

      await supabase.from('tasks').update({
        status: newStatus,
        completed_at: completedAt,
        proof_image: publicUrl || null,
        rejection_reason: rejectionReason
      }).eq('id', selectedTaskForUpload);

      setSelectedTaskForUpload(null);
    };
    reader.readAsDataURL(file);
  };

  const updateTaskStatus = (id: string, status: VerificationStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const triggerUpload = (id: string) => {
    setSelectedTaskForUpload(id);
    fileInputRef.current?.click();
  };

  return (
    <div className="pb-20 md:pb-0 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Today's Tasks</h2>
          <p className="text-slate-400 text-sm">
             Today's Load: <span className={`${todayUsed > dailyLimit ? 'text-red-400' : 'text-indigo-400'}`}>{todayUsed.toFixed(1)}h</span> / {dailyLimit.toFixed(1)}h limit
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
                  "{randomQuote.text}"
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
              
              {task.status === VerificationStatus.VERIFIED && task.proofImage && (
                  <button 
                    onClick={() => setPreviewProof(task.proofImage!)}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 px-2 py-1 -ml-2 mt-2 rounded transition-colors"
                  >
                    <Icons.Eye className="w-4 h-4" />
                    View Proof
                  </button>
              )}
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
               ) : verifyingId === task.id ? (
                 <div className="flex items-center gap-2 text-indigo-400 px-4 py-2 animate-pulse">
                    <Icons.Shield className="w-5 h-5 animate-bounce" />
                    <span>AI Verifying...</span>
                 </div>
               ) : (
                 <div className="w-full md:w-auto">
                    <button 
                        onClick={() => triggerUpload(task.id)}
                        className="w-full md:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 transition-colors"
                    >
                        <Icons.Upload className="w-4 h-4" />
                        Submit Proof
                    </button>
                 </div>
               )}
            </div>
          </div>
        ))}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*,application/pdf"
        className="hidden" 
      />

      {/* Proof Preview Modal */}
      {previewProof && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setPreviewProof(null)}>
              <div className="relative max-w-4xl w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col border border-slate-700 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/50">
                      <h3 className="text-white font-medium flex items-center gap-2">
                          <Icons.Shield className="w-4 h-4 text-indigo-400" />
                          Verified Proof
                      </h3>
                      <button onClick={() => setPreviewProof(null)} className="text-slate-400 hover:text-white transition-colors">
                          <Icons.XCircle className="w-6 h-6" />
                      </button>
                  </div>
                  <div className="flex-1 bg-black/50 flex items-center justify-center p-1 min-h-[50vh] max-h-[80vh] overflow-auto">
                      {previewProof.includes('application/pdf') ? (
                          <object data={previewProof} type="application/pdf" className="w-full h-[70vh] rounded bg-white">
                              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                  <p>PDF preview not available.</p>
                                  <a href={previewProof} download="proof.pdf" className="text-indigo-400 hover:underline">Download PDF</a>
                              </div>
                          </object>
                      ) : (
                          <img src={previewProof} alt="Proof" className="max-w-full max-h-[75vh] object-contain rounded shadow-lg" />
                      )}
                  </div>
                   <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-900">
                      <span className="text-xs text-slate-500">Verified by Goal Guardian AI</span>
                      <a 
                          href={previewProof} 
                          download={`proof_${Date.now()}.${previewProof.includes('application/pdf') ? 'pdf' : 'png'}`} 
                          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
                      >
                          <Icons.Upload className="w-4 h-4 rotate-180" />
                          Download File
                      </a>
                  </div>
              </div>
          </div>
      )}

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
                <label className="block text-sm text-slate-400 mb-1">Description (for AI Verification)</label>
                <textarea 
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 h-24 resize-none"
                  placeholder="Describe exactly what will be visible in the proof..."
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