import React, { useState, useRef } from 'react';
import { Icons } from './Icons';
import { UserProfile } from '../types';

interface ScreenTimeUploadProps {
  user: UserProfile;
  onSubmit: (hours: number) => void;
}

export const ScreenTimeUpload: React.FC<ScreenTimeUploadProps> = ({ user, onSubmit }) => {
  const [hours, setHours] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async () => {
    if (hours >= 0 && user && user.googleId) {
      try {
        setIsUploading(true);
        onSubmit(hours);
        setHours(0);
        alert("Screen time logged successfully.");
      } catch (error) {
        console.error(error);
        alert("Failed to process screen time.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
             <Icons.Smartphone className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Daily Screen Time</h2>
          <p className="text-slate-400 text-center mt-2">
            Log your daily screen time hours.
            <br/><span className="text-red-400 text-sm font-medium">Please submit before 11:00 PM</span>
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Total Hours Today</label>
            <div className="relative">
              <input 
                type="number" 
                step="0.1"
                value={hours}
                onChange={(e) => setHours(parseFloat(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-indigo-500"
              />
              <span className="absolute right-4 top-3.5 text-slate-500">hrs</span>
            </div>
          </div>

          <button 
            onClick={handleSubmit}
            disabled={hours === 0 || isUploading}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              hours > 0 && !isUploading
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/30' 
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isUploading ? 'Processing...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
};
