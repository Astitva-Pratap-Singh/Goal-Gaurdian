import React, { useEffect } from 'react';
import { Icons } from './Icons';
import { jwtDecode } from "jwt-decode";

interface AuthProps {
  onLogin: (user: any) => void;
}

declare global {
  interface Window {
    google: any;
  }
}

// Helper to safely get Env Vars in Vite or Standard environments
const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    return import.meta.env[`VITE_${key}`] || import.meta.env[key];
  }
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env) {
    // @ts-ignore
    return process.env[`REACT_APP_${key}`] || process.env[key];
  }
  return "";
};

// Get Client ID from environment variable or fallback to a placeholder
const RAW_CLIENT_ID = getEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_ID = RAW_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"; 

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  
  useEffect(() => {
    /* Initialize Google Identity Services */
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        theme: "filled_black"
      });

      // Only render the button if we have a valid Client ID (not the placeholder)
      // Otherwise, the user will rely on the Demo Mode button
      const isConfigured = !GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID");
      
      if (isConfigured) {
        window.google.accounts.id.renderButton(
          document.getElementById("googleSignInDiv"),
          { theme: "outline", size: "large", width: "100%", text: "continue_with" }
        );
      }
    }
  }, []);

  const handleCredentialResponse = (response: any) => {
    try {
      const decoded: any = jwtDecode(response.credential);
      onLogin({
        name: decoded.name,
        email: decoded.email,
        avatarUrl: decoded.picture,
        googleId: decoded.sub
      });
    } catch (error) {
      console.error("Auth Error", error);
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

  const isConfigured = !GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID");

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
             {/* The actual Google Button Container */}
             <div id="googleSignInDiv" className="w-full flex justify-center min-h-[40px]">
                {!isConfigured && (
                  <div className="text-amber-500 text-sm bg-amber-950/30 p-3 rounded border border-amber-900/50 w-full text-center">
                    Google Auth not configured. <br/>
                    Set VITE_GOOGLE_CLIENT_ID in Vercel Env Vars.
                  </div>
                )}
             </div>
             
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