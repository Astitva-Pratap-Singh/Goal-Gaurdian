export enum TaskType {
  STUDY = 'Study/Learning',
  WORK = 'Work/Projects',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFYING = 'VERIFYING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  durationHours: number;
  createdAt: number;
  completedAt?: number;
  status: VerificationStatus;
  proofImage?: string; // Base64
  rejectionReason?: string;
}

export interface ScreenTimeEntry {
  date: string; // ISO Date YYYY-MM-DD
  hours: number;
  proofImage?: string;
  submittedAt: number;
}

export interface WeeklyStats {
  weekId: string; // YYYY-Www
  goalHours: number;
  completedHours: number;
  screenTimeHours: number;
  rating: number; // 0.0 to 10.0
  streakActive: boolean;
  startDate: string;
  endDate: string;
}

export interface HistoryEntry extends WeeklyStats {
  id: string;
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
  weeklyGoalHours: number;
  currentStreak: number;
  googleId?: string;
}