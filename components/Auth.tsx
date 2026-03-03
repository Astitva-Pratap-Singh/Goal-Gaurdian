import React, { useEffect } from 'react';
import { Icons } from './Icons';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup } from 'firebase/auth';

interface AuthProps {
  onLogin: (user: any) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      onLogin({
        name: user.displayName,
        email: user.email,
        avatarUrl: user.photoURL,
        googleId: user.uid // Using Firebase UID as googleId
      });
    } catch (error) {
      console.error("Auth Error", error);
      alert("Failed to sign in with Google");
    }
  };

  // Fallback for development since we don't have a real Client ID in this demo environment
  const handleDevLogin = () => {
    onLogin({
      name: "Demo User",
      email: "demo@goalguardian.ai",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=GoalGuardian",
      googleId: "dev-123"
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-900/50">
            <Icons.Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Goal Guardian</h1>
          <p className="text-slate-400">Strict, AI-Verified Productivity.</p>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col gap-4">
             {/* Firebase Google Button */}
             <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                Continue with Google
            </button>
             
             <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink-0 mx-4 text-slate-600 text-xs">DEMO ACCESS</span>
                <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <button 
                onClick={handleDevLogin}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-700"
            >
                Enter Demo Mode
            </button>
          </div>
        </div>

        <p className="text-xs text-center text-slate-600 mt-8">
          By continuing, you agree to the strict AI verification protocols.
        </p>
      </div>
    </div>
  );
};