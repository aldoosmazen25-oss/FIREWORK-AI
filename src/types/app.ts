import type {
  PortfolioItem,
  SocialLinks,
  ToolExecutionTrace,
  UserPreferences,
  WorkHistoryItem,
} from '../db/schema';
import type { AppMode, AvailabilityStatus, AccountType } from '../utils/domain';

export type PageId =
  | 'home'
  | 'workspace'
  | 'discover-projects'
  | 'find-freelancers'
  | 'my-projects'
  | 'messages'
  | 'tasks'
  | 'calendar'
  | 'saved'
  | 'lens'
  | 'integrations'
  | 'notifications'
  | 'settings'
  | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  photoUrl: string | null;
  accountType: AccountType;
  role: 'user' | 'admin';
  accountStatus: 'active' | 'suspended';
  title: string;
  bio: string;
  country: string;
  preferredLanguage: 'en' | 'ar';
  mode: AppMode;
  availability: AvailabilityStatus;
  experienceLevel: string;
  hourlyRate: number | null;
  skills: string[];
  interests: string[];
  preferredCategories: string[];
  socialLinks: SocialLinks;
  portfolio: PortfolioItem[];
  workHistory: WorkHistoryItem[];
  preferences: UserPreferences;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRecord {
  id: number;
  slug: string;
  nameEn: string;
  nameAr: string;
  description: string;
  active: boolean;
}

export interface ProjectRecord {
  id: number;
  clientUid: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  budgetType: 'fixed' | 'hourly';
  budgetMin: number;
  budgetMax: number | null;
  duration: string;
  experienceLevel: string;
  projectType: string;
  remote: boolean;
  requirements: string;
  deadline: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  proposalCount?: number;
  matchScore?: number;
  client?: {
    uid: string;
    fullName: string;
    title: string;
    country: string;
    photoUrl: string | null;
  };
}

export interface FreelancerSummary {
  uid: string;
  fullName: string;
  photoUrl: string | null;
  title: string;
  bio: string;
  country: string;
  availability: AvailabilityStatus;
  mode: AppMode;
  experienceLevel: string;
  hourlyRate: number | null;
  skills: string[];
  preferredCategories: string[];
  portfolio: PortfolioItem[];
  workHistory: WorkHistoryItem[];
  socialLinks: SocialLinks;
}

export interface ProposalRecord {
  id: number;
  projectId: number;
  freelancerUid: string;
  approach: string;
  estimatedDuration: string;
  proposedBudget: number;
  status: string;
  createdAt: string;
  projectTitle?: string;
  projectCategory?: string;
  projectStatus?: string;
  freelancer?: {
    uid: string;
    fullName: string;
    title: string;
    photoUrl: string | null;
    skills: string[];
    portfolio: PortfolioItem[];
  };
}

export interface MilestoneRecord {
  id: number;
  engagementId: number;
  title: string;
  description: string;
  amount: number;
  dueDate: string | null;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved';
}

export interface EngagementRecord {
  id: number;
  projectId: number;
  proposalId: number | null;
  clientUid: string;
  freelancerUid: string;
  agreedBudget: number;
  progress: number;
  status: string;
  deadline: string | null;
  projectTitle: string;
  projectCategory: string;
  projectDescription: string;
  milestones: MilestoneRecord[];
  counterpart: {
    uid: string;
    fullName: string;
    title: string;
    photoUrl: string | null;
  } | null;
}

export interface TaskRecord {
  id: number;
  ownerUid: string;
  assigneeUid: string | null;
  projectId: number | null;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: number;
  participantAUid: string;
  participantBUid: string;
  projectId: number | null;
  lastMessageAt: string;
  participant: {
    uid: string;
    fullName: string;
    title: string;
    photoUrl: string | null;
    availability: string;
  } | null;
  lastMessage: MessageRecord | null;
  unreadCount: number;
}

export interface MessageRecord {
  id: number;
  conversationId: number;
  senderUid: string;
  body: string;
  attachmentName: string | null;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: number;
  userUid: string;
  type: string;
  title: string;
  body: string;
  targetPage: string | null;
  targetId: string | null;
  essential: boolean;
  read: boolean;
  createdAt: string;
}

export interface SavedItemRecord {
  id: number;
  itemType: 'project' | 'freelancer';
  itemId: string;
  createdAt: string;
  project?: ProjectRecord | null;
  freelancer?: {
    uid: string;
    fullName: string;
    title: string;
    photoUrl: string | null;
    skills: string[];
    availability: string;
  } | null;
}

export interface AiConversationRecord {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRecord {
  id: number;
  conversationId: number;
  role: 'user' | 'model';
  content: string;
  toolCalls: ToolExecutionTrace[];
  createdAt: string;
}

export interface WorkspaceNoteRecord {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  colorTag: string;
  updatedAt: string;
}
