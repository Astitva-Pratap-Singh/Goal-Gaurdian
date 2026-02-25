-- Run this in your Supabase SQL Editor to initialize the database

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    google_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,
    weekly_goal_hours NUMERIC DEFAULT 80,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES public.profiles(google_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    duration_hours NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    proof_image TEXT,
    rejection_reason TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Weekly Stats Table
CREATE TABLE IF NOT EXISTS public.weekly_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES public.profiles(google_id) ON DELETE CASCADE,
    week_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    goal_hours NUMERIC NOT NULL,
    completed_hours NUMERIC DEFAULT 0,
    screen_time_hours NUMERIC DEFAULT 0,
    rating NUMERIC DEFAULT 0,
    streak_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, week_id)
);

-- 4. Set up Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_stats ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies (Allow all for this demo, or restrict by user_id)
-- Profiles: Users can read and update their own profile
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (true);

-- Tasks: Users can CRUD their own tasks
CREATE POLICY "Users can view their own tasks" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Users can insert their own tasks" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own tasks" ON public.tasks FOR UPDATE USING (true);
CREATE POLICY "Users can delete their own tasks" ON public.tasks FOR DELETE USING (true);

-- Weekly Stats: Users can CRUD their own stats
CREATE POLICY "Users can view their own stats" ON public.weekly_stats FOR SELECT USING (true);
CREATE POLICY "Users can insert their own stats" ON public.weekly_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own stats" ON public.weekly_stats FOR UPDATE USING (true);
CREATE POLICY "Users can delete their own stats" ON public.weekly_stats FOR DELETE USING (true);
