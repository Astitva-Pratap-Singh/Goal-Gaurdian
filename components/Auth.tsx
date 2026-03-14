import React, { useState } from 'react';
import { Icons } from './Icons';
import { signIn } from 'next-auth/react';
import Image from 'next/image';

interface AuthProps {
  onLogin?: (user: any) => void;
}

export const Auth: React.FC<AuthProps> = () => {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await signIn('google');
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

        <form onSubmit={handleLogin} className="space-y-6">
          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Icons.Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} className="w-5 h-5" alt="Google" referrerPolicy="no-referrer" />
            )}
            Continue with Google
          </button>
        </form>

        <p className="text-xs text-center text-slate-600 mt-8">
          By continuing, you agree to the strict AI verification protocols.
        </p>
      </div>
    </div>
  );
};
