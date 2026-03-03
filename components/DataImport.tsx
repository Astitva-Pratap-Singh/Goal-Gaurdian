import React, { useState } from 'react';
import { db } from '../services/firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { UserProfile, Task, WeeklyStats, VerificationStatus, TaskType } from '../types';
import { Icons } from './Icons';

interface DataImportProps {
  user: UserProfile;
}

export const DataImport: React.FC<DataImportProps> = ({ user }) => {
  const [tasksJson, setTasksJson] = useState('');
  const [historyJson, setHistoryJson] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleImport = async () => {
    if (!user.googleId) {
      setStatus({ type: 'error', message: 'User ID not found. Please refresh.' });
      return;
    }

    setIsImporting(true);
    setStatus({ type: 'info', message: 'Starting import...' });

    try {
      const batch = writeBatch(db);
      let taskCount = 0;
      let historyCount = 0;

      // Import Tasks
      if (tasksJson.trim()) {
        try {
          const tasks = JSON.parse(tasksJson);
          if (!Array.isArray(tasks)) throw new Error('Tasks JSON must be an array');

          tasks.forEach((t: any) => {
            // Map Supabase/Generic fields to our Firestore schema
            const taskId = t.id || doc(collection(db, 'tasks')).id;
            const taskRef = doc(db, 'tasks', taskId);
            
            // Heuristic date conversion
            const createdAt = new Date(t.created_at || t.createdAt || Date.now()).getTime();
            const completedAt = t.completed_at || t.completedAt ? new Date(t.completed_at || t.completedAt).getTime() : undefined;

            const taskData: any = {
              userId: user.googleId,
              title: t.title || 'Untitled Task',
              description: t.description || '',
              type: t.type === 'Work/Projects' ? TaskType.WORK : TaskType.STUDY, // Default mapping
              durationHours: Number(t.duration_hours || t.durationHours || 0),
              createdAt: createdAt,
              status: t.status === 'VERIFIED' ? VerificationStatus.VERIFIED : VerificationStatus.PENDING,
              proofImage: t.proof_image || t.proofImage || '',
              rejectionReason: t.rejection_reason || t.rejectionReason || ''
            };

            if (completedAt) taskData.completedAt = completedAt;

            batch.set(taskRef, taskData);
            taskCount++;
          });
        } catch (e: any) {
          throw new Error(`Failed to parse Tasks JSON: ${e.message}`);
        }
      }

      // Import History
      if (historyJson.trim()) {
        try {
          const history = JSON.parse(historyJson);
          if (!Array.isArray(history)) throw new Error('History JSON must be an array');

          history.forEach((h: any) => {
            const weekId = h.week_id || h.weekId;
            if (!weekId) return; // Skip invalid entries

            const statsRef = doc(db, 'weeklyStats', `${user.googleId}_${weekId}`);
            
            const statsData: any = {
              userId: user.googleId,
              weekId: weekId,
              goalHours: Number(h.goal_hours || h.goalHours || 0),
              completedHours: Number(h.completed_hours || h.completedHours || 0),
              screenTimeHours: Number(h.screen_time_hours || h.screenTimeHours || 0),
              rating: Number(h.rating || 0),
              streakActive: Boolean(h.streak_active || h.streakActive),
              startDate: h.start_date || h.startDate || '',
              endDate: h.end_date || h.endDate || ''
            };

            batch.set(statsRef, statsData);
            historyCount++;
          });
        } catch (e: any) {
          throw new Error(`Failed to parse History JSON: ${e.message}`);
        }
      }

      if (taskCount === 0 && historyCount === 0) {
        setStatus({ type: 'info', message: 'No data to import.' });
        setIsImporting(false);
        return;
      }

      await batch.commit();
      setStatus({ type: 'success', message: `Successfully imported ${taskCount} tasks and ${historyCount} history entries!` });
      setTasksJson('');
      setHistoryJson('');

    } catch (err: any) {
      console.error('Import error:', err);
      setStatus({ type: 'error', message: err.message || 'Import failed.' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-indigo-500/10 rounded-xl">
          <Icons.Database className="w-8 h-8 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Data Migration</h1>
          <p className="text-slate-400">Import your history from Supabase or other sources.</p>
        </div>
      </div>

      {status && (
        <div className={`p-4 rounded-lg border ${
          status.type === 'success' ? 'bg-green-900/20 border-green-800 text-green-400' :
          status.type === 'error' ? 'bg-red-900/20 border-red-800 text-red-400' :
          'bg-blue-900/20 border-blue-800 text-blue-400'
        }`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tasks Import */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Icons.CheckCircle className="w-5 h-5 text-indigo-400" />
            Tasks JSON
          </h3>
          <p className="text-xs text-slate-500 mb-2">
            Paste an array of task objects. Expected fields: <code>title, description, duration_hours, created_at, status</code>
          </p>
          <textarea
            value={tasksJson}
            onChange={(e) => setTasksJson(e.target.value)}
            className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder='[{"title": "Study Math", "duration_hours": 2, ...}]'
          />
        </div>

        {/* History Import */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Icons.BarChart className="w-5 h-5 text-indigo-400" />
            History/Stats JSON
          </h3>
          <p className="text-xs text-slate-500 mb-2">
            Paste an array of weekly stats. Expected fields: <code>week_id, goal_hours, completed_hours, rating</code>
          </p>
          <textarea
            value={historyJson}
            onChange={(e) => setHistoryJson(e.target.value)}
            className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 resize-none"
            placeholder='[{"week_id": "2023-W40", "goal_hours": 40, ...}]'
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleImport}
          disabled={isImporting}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
            isImporting 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'
          }`}
        >
          {isImporting ? (
            <>
              <Icons.Loader className="w-5 h-5 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Icons.Upload className="w-5 h-5" />
              Start Import
            </>
          )}
        </button>
      </div>
    </div>
  );
};
