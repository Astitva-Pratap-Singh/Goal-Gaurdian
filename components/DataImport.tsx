import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, Database, BarChart } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { Task, TaskType, VerificationStatus, WeeklyStats } from '../types';
import { UserProfile } from '../types';

interface DataImportProps {
  user: UserProfile | null;
}

interface CSVTask {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: string;
  duration_hours: number;
  status: string;
  proof_image: string;
  rejection_reason: string;
  created_at: number;
  completed_at: number | null;
}

interface CSVWeeklyStats {
  id: string;
  user_id: string;
  week_id: string;
  start_date: string;
  end_date: string;
  goal_hours: number;
  completed_hours: number;
  screen_time_hours: number;
  rating: number;
  streak_active: boolean | string;
}

type ImportType = 'tasks' | 'weeklyStats';

export const DataImport: React.FC<DataImportProps> = ({ user }) => {
  const [importType, setImportType] = useState<ImportType>('tasks');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadStatus('idle');
      setErrorMessage(null);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setErrorMessage(`Error parsing CSV: ${results.errors[0].message}`);
          return;
        }
        setPreviewData(results.data);
      },
      error: (error: Error) => {
        setErrorMessage(`Error reading file: ${error.message}`);
      }
    });
  };

  const mapCSVToTask = (csvTask: CSVTask): Task => {
    // Map status string to enum
    let status = VerificationStatus.PENDING;
    if (csvTask.status === 'VERIFIED') status = VerificationStatus.VERIFIED;
    if (csvTask.status === 'REJECTED') status = VerificationStatus.REJECTED;
    if (csvTask.status === 'VERIFYING') status = VerificationStatus.VERIFYING;

    // Map type string to enum
    let type = TaskType.STUDY;
    if (csvTask.type === 'Work/Projects') type = TaskType.WORK;

    return {
      id: csvTask.id,
      title: csvTask.title,
      description: csvTask.description,
      type: type,
      durationHours: Number(csvTask.duration_hours) || 0,
      createdAt: Number(csvTask.created_at) || Date.now(),
      completedAt: csvTask.completed_at ? Number(csvTask.completed_at) : undefined,
      status: status,
      proofImage: csvTask.proof_image || undefined,
      rejectionReason: csvTask.rejection_reason || undefined
    };
  };

  const mapCSVToWeeklyStats = (csvStats: CSVWeeklyStats): WeeklyStats => {
    return {
      weekId: csvStats.week_id,
      goalHours: Number(csvStats.goal_hours) || 0,
      completedHours: Number(csvStats.completed_hours) || 0,
      screenTimeHours: Number(csvStats.screen_time_hours) || 0,
      rating: Number(csvStats.rating) || 0,
      streakActive: csvStats.streak_active === true || csvStats.streak_active === 'true',
      startDate: csvStats.start_date,
      endDate: csvStats.end_date,
    };
  };

  const removeUndefined = (obj: any) => {
    Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
    return obj;
  };

  const handleUpload = async () => {
    if (!user || previewData.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const collectionName = importType === 'tasks' ? 'tasks' : 'weeklyStats';
      const collectionRef = collection(db, collectionName);

      // Process in chunks of 50 to avoid payload size limits
      const CHUNK_SIZE = 50;
      const chunks = [];
      for (let i = 0; i < previewData.length; i += CHUNK_SIZE) {
        chunks.push(previewData.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        for (const csvRow of chunk) {
          let docData: any;
          let docId: string;

          if (importType === 'tasks') {
            const task = mapCSVToTask(csvRow as CSVTask);
            docId = task.id;
            docData = {
              ...task,
              userId: user.googleId || 'anonymous'
            };
          } else {
            const stats = mapCSVToWeeklyStats(csvRow as CSVWeeklyStats);
            docId = (csvRow as CSVWeeklyStats).id || stats.weekId;
            docData = {
              ...stats,
              userId: user.googleId || 'anonymous'
            };
          }

          // Remove undefined fields to prevent Firestore errors
          docData = removeUndefined(docData);

          const docRef = doc(collectionRef, docId);
          batch.set(docRef, docData);
        }

        await batch.commit();
      }

      setUploadStatus('success');
      setFile(null);
      setPreviewData([]);
    } catch (error: any) {
      console.error('Import error:', error);
      setUploadStatus('error');
      setErrorMessage(error.message || 'Failed to import data');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Import Data</h1>
        <p className="text-gray-600">
          Upload a CSV file to import your history.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Import Type</label>
          <div className="flex gap-4">
            <button
              onClick={() => { setImportType('tasks'); setFile(null); setPreviewData([]); setUploadStatus('idle'); }}
              className={`flex-1 py-3 px-4 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                importType === 'tasks' 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Tasks</span>
            </button>
            <button
              onClick={() => { setImportType('weeklyStats'); setFile(null); setPreviewData([]); setUploadStatus('idle'); }}
              className={`flex-1 py-3 px-4 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                importType === 'weeklyStats' 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <BarChart className="w-5 h-5" />
              <span className="font-medium">Weekly Stats</span>
            </button>
          </div>
        </div>

        <div 
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            file ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile?.type === 'text/csv' || droppedFile?.name.endsWith('.csv')) {
              setFile(droppedFile);
              parseCSV(droppedFile);
            }
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            className="hidden"
          />
          
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-indigo-100 rounded-full text-indigo-600">
              {file ? <FileText size={32} /> : <Upload size={32} />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {file ? file.name : 'Drop your CSV file here'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {file ? `${previewData.length} records found` : 'or click to browse'}
              </p>
            </div>
            {!file && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Select File
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{errorMessage}</p>
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-600">Successfully imported {importType === 'tasks' ? 'tasks' : 'stats'}!</p>
          </div>
        )}

        {previewData.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Preview ({previewData.length} items)</h3>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import Data
                  </>
                )}
              </button>
            </div>
            
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {importType === 'tasks' ? (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        </>
                      ) : (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Week</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Goal</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Streak</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewData.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {importType === 'tasks' ? (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.title}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.duration_hours}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.status}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(row.created_at).toLocaleDateString()}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.week_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.goal_hours}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.completed_hours}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.rating}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{String(row.streak_active)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 5 && (
                <div className="px-6 py-3 bg-gray-50 text-sm text-gray-500 text-center border-t border-gray-200">
                  And {previewData.length - 5} more...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
