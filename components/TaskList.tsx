import React, { useState, useRef } from 'react';
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

  // Daily Limit Calculation
  const dailyLimit = user.weeklyGoalHours / 7;
  // Calculate today's verified + pending tasks duration
  const todayTasks = tasks.filter(t => {
      const isToday = new Date(t.createdAt).toDateString() === new Date().toDateString();
      return isToday && t.status !== VerificationStatus.REJECTED;
  });
  const todayUsed = todayTasks.reduce((acc, t) => acc + t.durationHours, 0);

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

    // Check limits
    if (!editingTaskId) {
        if (todayUsed + newTaskDuration > dailyLimit) {
            alert(`Cannot add task. This would exceed your daily calculated limit of ${dailyLimit.toFixed(1)} hours.`);
            return;
        }
    }

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
            alert("Failed to save task to database.");
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
      
      await supabase.from('tasks').update({
        status: newStatus,
        completed_at: result.verified ? Date.now() : null,
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
          <h2 className="text-2xl font-bold text-white">Tasks</h2>
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
        {tasks.length === 0 && (
            <div className="text-center py-20 text-slate-500">
                <Icons.CheckCircle className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>No tasks yet. Start forging your week!</p>
            </div>
        )}

        {tasks.map(task => (
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
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded border ${task.type === TaskType.STUDY ? 'bg-indigo-950/50 border-indigo-900 text-indigo-400' : 'bg-teal-950/50 border-teal-900 text-teal-400'}`}>
                  {task.type}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Icons.Clock className="w-3 h-3" /> {task.durationHours}h
                </span>
                {task.status === VerificationStatus.REJECTED && (
                    <span className="text-xs text-red-400 bg-red-950/30 px-2 rounded">Rejected: {task.rejectionReason}</span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-100 pr-8">{task.title}</h3>
              <p className="text-slate-400 text-sm mt-1">{task.description}</p>
              
              {task.status === VerificationStatus.VERIFIED && task.proofImage && (
                  <a href={task.proofImage} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline mt-2 inline-block">
                    View Verified Proof
                  </a>
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