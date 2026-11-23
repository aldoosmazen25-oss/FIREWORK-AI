import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  year: string;
}

export interface WorkHistoryItem {
  id: string;
  role: string;
  company: string;
  period: string;
  summary: string;
}

export interface SocialLinks {
  website?: string;
  github?: string;
  linkedin?: string;
  portfolio?: string;
}

export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
  defaultWorkspace: string;
  workModeAutoPrioritize: boolean;
  sleepModeMuteNonEssential: boolean;
  notifyMessages: boolean;
  notifyProjects: boolean;
  notifyProposals: boolean;
  notifyDeadlines: boolean;
  notifyAi: boolean;
  profileVisibility: 'public' | 'members' | 'private';
  discoverable: boolean;
  aiResponseStyle: 'concise' | 'detailed' | 'technical';
  aiUseContext: boolean;
}

export interface ToolExecutionTrace {
  toolName: string;
  args: Record<string, unknown>;
  status: 'success' | 'error' | 'requires_confirmation';
  summary: string;
  navigationTarget?: string;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  density: 'comfortable',
  defaultWorkspace: 'dashboard',
  workModeAutoPrioritize: true,
  sleepModeMuteNonEssential: true,
  notifyMessages: true,
  notifyProjects: true,
  notifyProposals: true,
  notifyDeadlines: true,
  notifyAi: true,
  profileVisibility: 'public',
  discoverable: true,
  aiResponseStyle: 'concise',
  aiUseContext: true,
};

export const users = pgTable('users', {
  uid: text('uid').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  photoUrl: text('photo_url'),
  accountType: text('account_type').notNull().default('freelancer'), // 'freelancer' | 'client'
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  accountStatus: text('account_status').notNull().default('active'), // 'active' | 'suspended'
  title: text('title').default(''),
  bio: text('bio').default(''),
  country: text('country').default(''),
  preferredLanguage: text('preferred_language').notNull().default('en'), // 'en' | 'ar'
  mode: text('mode').notNull().default('work'), // 'work' | 'sleep'
  availability: text('availability').notNull().default('available'), // 'available' | 'busy' | 'offline'
  experienceLevel: text('experience_level').notNull().default('mid'), // 'entry' | 'mid' | 'senior' | 'principal'
  hourlyRate: integer('hourly_rate'),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  interests: jsonb('interests').$type<string[]>().notNull().default([]),
  preferredCategories: jsonb('preferred_categories').$type<string[]>().notNull().default([]),
  socialLinks: jsonb('social_links').$type<SocialLinks>().notNull().default({}),
  portfolio: jsonb('portfolio').$type<PortfolioItem[]>().notNull().default([]),
  workHistory: jsonb('work_history').$type<WorkHistoryItem[]>().notNull().default([]),
  preferences: jsonb('preferences').$type<UserPreferences>().notNull().default(DEFAULT_USER_PREFERENCES),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
  description: text('description').default(''),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  clientUid: text('client_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  budgetType: text('budget_type').notNull().default('fixed'), // 'fixed' | 'hourly'
  budgetMin: integer('budget_min').notNull(),
  budgetMax: integer('budget_max'),
  duration: text('duration').notNull(),
  experienceLevel: text('experience_level').notNull().default('mid'), // 'entry' | 'mid' | 'senior' | 'principal'
  projectType: text('project_type').notNull().default('one-time'), // 'one-time' | 'ongoing' | 'retainer'
  remote: boolean('remote').notNull().default(true),
  requirements: text('requirements').default(''),
  deadline: text('deadline'),
  status: text('status').notNull().default('open'), // 'draft' | 'open' | 'in_progress' | 'completed' | 'closed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const proposals = pgTable('proposals', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  freelancerUid: text('freelancer_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  approach: text('approach').notNull(),
  estimatedDuration: text('estimated_duration').notNull(),
  proposedBudget: integer('proposed_budget').notNull(),
  status: text('status').notNull().default('submitted'), // 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const engagements = pgTable('engagements', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  proposalId: integer('proposal_id').references(() => proposals.id, { onDelete: 'set null' }),
  clientUid: text('client_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  freelancerUid: text('freelancer_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  agreedBudget: integer('agreed_budget').notNull(),
  progress: integer('progress').notNull().default(0),
  status: text('status').notNull().default('active'), // 'active' | 'review' | 'completed' | 'paused'
  deadline: text('deadline'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const milestones = pgTable('milestones', {
  id: serial('id').primaryKey(),
  engagementId: integer('engagement_id')
    .references(() => engagements.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  description: text('description').default(''),
  amount: integer('amount').notNull().default(0),
  dueDate: text('due_date'),
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'submitted' | 'approved'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  ownerUid: text('owner_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  assigneeUid: text('assignee_uid').references(() => users.uid, { onDelete: 'set null' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').default(''),
  status: text('status').notNull().default('todo'), // 'todo' | 'in_progress' | 'review' | 'completed'
  priority: text('priority').notNull().default('medium'), // 'low' | 'medium' | 'high'
  dueDate: text('due_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  participantAUid: text('participant_a_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  participantBUid: text('participant_b_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  senderUid: text('sender_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  body: text('body').notNull(),
  attachmentName: text('attachment_name'),
  attachmentUrl: text('attachment_url'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  targetPage: text('target_page'),
  targetId: text('target_id'),
  essential: boolean('essential').notNull().default(false),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const savedItems = pgTable('saved_items', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  itemType: text('item_type').notNull(), // 'project' | 'freelancer'
  itemId: text('item_id').notNull(),
  note: text('note').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiMessages = pgTable('ai_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => aiConversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // 'user' | 'model'
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls').$type<ToolExecutionTrace[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiToolExecutions = pgTable('ai_tool_executions', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  conversationId: integer('conversation_id').references(() => aiConversations.id, { onDelete: 'set null' }),
  toolName: text('tool_name').notNull(),
  args: jsonb('args').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull(),
  resultSummary: text('result_summary').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workspaceNotes = pgTable('workspace_notes', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  colorTag: text('color_tag').notNull().default('neutral'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterUid: text('reporter_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  targetType: text('target_type').notNull(), // 'project' | 'user'
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(),
  details: text('details').default(''),
  status: text('status').notNull().default('open'), // 'open' | 'reviewed' | 'resolved' | 'dismissed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
