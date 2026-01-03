import React, { useState } from 'react';
import { Icons } from './Icons';
import { UserProfile } from '../types';
import { uploadToR2 } from '../services/storage';

interface ScreenTimeUploadProps {
  user: UserProfile;
  onSubmit: (hours: number, imageUrl: string) => void;
}

export const ScreenTimeUpload: React.FC<ScreenTimeUploadProps> = ({ user, onSubmit }) => {
  const [hours, setHours] = useState<number>(0);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (hours >= 0 && file && user) {
      try {
        setIsUploading(true);
        // Upload simulation (Stores Base64)
        const url = await uploadToR2(file, user.googleId, 'screentime');
        
        onSubmit(hours, url);
        setHours(0);
        setImagePreview(null);
        setFile(null);
        alert("Screen time logged successfully.");
      } catch (error) {
        console.error(error);
        alert("Failed to process image.");
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
            Upload a screenshot of your device's "Screen Time" or "Digital Wellbeing" dashboard.
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

          <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:bg-slate-800/50 transition-colors">
             {imagePreview ? (
               <div className="relative">
                 <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                 <button 
                   onClick={() => { setImagePreview(null); setFile(null); }}
                   className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                 >
                   <Icons.XCircle className="w-4 h-4" />
                 </button>
               </div>
             ) : (
               <label className="cursor-pointer flex flex-col items-center gap-2">
                 <Icons.Upload className="w-8 h-8 text-slate-500" />
                 <span className="text-slate-400">Tap to upload screenshot</span>
                 <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
               </label>
             )}
          </div>

          <button 
            onClick={handleSubmit}
            disabled={!file || hours === 0 || isUploading}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              file && hours > 0 && !isUploading
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