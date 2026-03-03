import React, { useState } from 'react';
import { Icons } from './Icons';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup, signInAnonymously } from 'firebase/auth';

interface AuthProps {
  onLogin: (user: any) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      // onLogin is actually redundant if App.tsx listens to onAuthStateChanged, 
      // but we keep it for immediate feedback or if the parent uses it.
      onLogin({
        name: user.displayName,
        email: user.email,
        avatarUrl: user.photoURL,
        googleId: user.uid
      });
    } catch (err: any) {
      console.error("Auth Error", err);
      let msg = "Failed to sign in with Google.";
      if (err.code === 'auth/unauthorized-domain') {
        msg = "Domain not authorized. Add this URL to Firebase Console > Authentication > Settings > Authorized Domains.";
      } else if (err.code === 'auth/popup-closed-by-user') {
        msg = "Sign-in cancelled.";
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = "Google Sign-In is not enabled in Firebase Console.";
      } else if (err.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key') {
        msg = "Invalid API Key. Check your .env file.";
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signInAnonymously(auth);
      const user = result.user;
      onLogin({
        name: "Guest User",
        email: "guest@goalguardian.ai",
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        googleId: user.uid
      });
    } catch (err: any) {
      console.error("Anonymous Auth Error", err);
      let msg = "Failed to enter Guest Mode.";
      if (err.code === 'auth/operation-not-allowed') {
        msg = "Anonymous Sign-In is not enabled. Please enable it in Firebase Console > Authentication > Sign-in method.";
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const hasApiKey = !!import.meta.env.VITE_FIREBASE_API_KEY;

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

        {!hasApiKey && (
           <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-200 text-sm text-center">
              <strong>Configuration Missing</strong><br/>
              Please add VITE_FIREBASE_API_KEY and other config to your .env file.
           </div>
        )}

        {error && (
           <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-200 text-sm text-center">
              {error}
           </div>
        )}

        <div className="space-y-6">
          <div className="flex flex-col gap-4">
             {/* Firebase Google Button */}
             <button 
                onClick={handleGoogleLogin}
                disabled={isLoading || !hasApiKey}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? (
                  <Icons.Loader className="w-5 h-5 animate-spin" />
                ) : (
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                )}
                Continue with Google
            </button>
             
             <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink-0 mx-4 text-slate-600 text-xs">OR</span>
                <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <button 
                onClick={handleAnonymousLogin}
                disabled={isLoading || !hasApiKey}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? <Icons.Loader className="w-5 h-5 animate-spin" /> : <Icons.User className="w-5 h-5" />}
                Guest Mode (Anonymous)
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