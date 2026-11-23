import { FunctionDeclaration, Type } from '@google/genai';
import * as queries from '../db/queries.ts';
import type { ToolExecutionTrace, UserPreferences } from '../db/schema.ts';
import {
  computeSkillMatchRatio,
  validateProjectInput,
  validateProposalInput,
  validateTaskInput,
  type AppMode,
} from '../utils/domain.ts';
import { logAiDiagnostic } from './gemini-service.ts';

export const VALID_PAGES = [
  'home',
  'workspace',
  'discover-projects',
  'find-freelancers',
  'my-projects',
  'messages',
  'tasks',
  'calendar',
  'saved',
  'lens',
  'integrations',
  'notifications',
  'settings',
  'admin',
] as const;

export type ToolPermissionTier = 'read' | 'reversible' | 'consequential';

export interface LensClientAction {
  type: 'navigate' | 'mode_changed' | 'data_mutated';
  page?: string;
  mode?: AppMode;
  scope?: string;
}

export interface PendingConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
}

export interface ToolRegistryEntry {
  declaration: FunctionDeclaration;
  tier: ToolPermissionTier;
  liveEnabled?: boolean;
}

/**
 * IMPORTANT GEMINI SDK CONSTRAINT:
 * Type.OBJECT MUST NEVER have an empty `properties: {}` object (causes 400 INVALID_ARGUMENT).
 * For parameterless tools, OMIT `parameters` completely.
 */
export const LENS_TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  // =========================================================================
  // USER TOOLS (6)
  // =========================================================================
  get_user_profile: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_user_profile',
      description:
        'Fetch the authenticated user profile, account type, skills, availability, bio, and portfolio summary.',
    },
  },
  update_user_profile: {
    tier: 'reversible',
    declaration: {
      name: 'update_user_profile',
      description:
        'Update the authenticated user profile fields such as fullName, title, bio, country, availability, hourlyRate, or skills.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING, description: 'Full display name' },
          title: { type: Type.STRING, description: 'Professional title' },
          bio: { type: Type.STRING, description: 'Short professional biography' },
          country: { type: Type.STRING, description: 'Country or location' },
          availability: { type: Type.STRING, description: 'available, busy, or offline' },
          hourlyRate: { type: Type.NUMBER, description: 'Hourly rate in USD' },
          skills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Updated skills array',
          },
        },
      },
    },
  },
  get_user_preferences: {
    tier: 'read',
    declaration: {
      name: 'get_user_preferences',
      description:
        'Retrieve the authenticated user theme, density, notification, privacy, and Lens AI preferences.',
    },
  },
  update_user_preferences: {
    tier: 'reversible',
    declaration: {
      name: 'update_user_preferences',
      description:
        'Update user workspace preferences (theme, density, notifications, privacy visibility, or Lens AI style).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, description: 'system, light, or dark' },
          density: { type: Type.STRING, description: 'comfortable or compact' },
          sleepModeMuteNonEssential: { type: Type.BOOLEAN },
          notifyMessages: { type: Type.BOOLEAN },
          notifyProjects: { type: Type.BOOLEAN },
          notifyProposals: { type: Type.BOOLEAN },
          notifyDeadlines: { type: Type.BOOLEAN },
          profileVisibility: { type: Type.STRING, description: 'public, members, or private' },
          discoverable: { type: Type.BOOLEAN },
          aiResponseStyle: { type: Type.STRING, description: 'concise, detailed, or technical' },
          aiUseContext: { type: Type.BOOLEAN },
        },
      },
    },
  },
  get_user_mode: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_user_mode',
      description: 'Get the user current operating mode (work or sleep) and availability status.',
    },
  },
  set_user_mode: {
    tier: 'reversible',
    liveEnabled: true,
    declaration: {
      name: 'set_user_mode',
      description:
        'Switch the authenticated user between Work Mode ("work") and Sleep Mode ("sleep") and persist to PostgreSQL.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mode: { type: Type.STRING, description: 'Target operating mode: "work" or "sleep"' },
        },
        required: ['mode'],
      },
    },
  },

  // =========================================================================
  // PROJECT TOOLS (8)
  // =========================================================================
  search_projects: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'search_projects',
      description:
        'Search open projects in the Firework AI PostgreSQL database by keyword, category, skill, budget range, or experience level. Automatically ranks results by relevance.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Keyword matching title or description' },
          category: { type: Type.STRING, description: 'Category slug (e.g. software-engineering)' },
          skill: { type: Type.STRING, description: 'Required skill name' },
          experienceLevel: { type: Type.STRING, description: 'entry, mid, senior, or principal' },
          budgetMin: { type: Type.NUMBER, description: 'Minimum budget filter in USD' },
          budgetMax: { type: Type.NUMBER, description: 'Maximum budget filter in USD' },
          limit: { type: Type.INTEGER, description: 'Max number of projects to return (1-20)' },
        },
      },
    },
  },
  get_project_details: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_project_details',
      description: 'Retrieve full details for a single project by numeric project ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER, description: 'Numeric project ID' },
        },
        required: ['projectId'],
      },
    },
  },
  create_project: {
    tier: 'reversible',
    declaration: {
      name: 'create_project',
      description:
        'Create a validated project brief saved as a DRAFT in PostgreSQL so the user can review it before publishing with publish_project.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Clear project title (min 4 chars)' },
          description: { type: Type.STRING, description: 'Detailed project scope (min 15 chars)' },
          category: { type: Type.STRING, description: 'Category slug' },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          budgetType: { type: Type.STRING, description: 'fixed or hourly' },
          budgetMin: { type: Type.NUMBER, description: 'Minimum budget in USD' },
          budgetMax: { type: Type.NUMBER, description: 'Optional maximum budget in USD' },
          duration: { type: Type.STRING, description: 'Expected timeline (e.g. 4 weeks)' },
          experienceLevel: { type: Type.STRING, description: 'entry, mid, senior, or principal' },
          requirements: { type: Type.STRING, description: 'Deliverables or acceptance criteria' },
          deadline: { type: Type.STRING, description: 'Optional YYYY-MM-DD deadline' },
        },
        required: ['title', 'description', 'category', 'budgetMin', 'duration'],
      },
    },
  },
  update_project: {
    tier: 'reversible',
    declaration: {
      name: 'update_project',
      description: 'Update title, description, budget, duration, or deadline on a project owned by the user.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          duration: { type: Type.STRING },
          budgetMin: { type: Type.NUMBER },
          budgetMax: { type: Type.NUMBER },
          deadline: { type: Type.STRING },
        },
        required: ['projectId'],
      },
    },
  },
  publish_project: {
    tier: 'consequential',
    declaration: {
      name: 'publish_project',
      description:
        'Publish a draft project owned by the user to the public marketplace (sets status to "open"). Consequential action: requires confirmed=true after user confirmation.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER, description: 'Numeric ID of the draft project to publish' },
          confirmed: {
            type: Type.BOOLEAN,
            description: 'Set false unless the user explicitly confirmed via the confirmation dialog',
          },
        },
        required: ['projectId'],
      },
    },
  },
  archive_project: {
    tier: 'consequential',
    declaration: {
      name: 'archive_project',
      description:
        'Close/archive a project owned by the user so it no longer accepts proposals. Requires confirmed=true.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER },
          confirmed: { type: Type.BOOLEAN },
        },
        required: ['projectId'],
      },
    },
  },
  save_project: {
    tier: 'reversible',
    liveEnabled: true,
    declaration: {
      name: 'save_project',
      description: 'Save or unsave (bookmark toggle) a project in the user saved items list.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER, description: 'Numeric project ID' },
        },
        required: ['projectId'],
      },
    },
  },
  get_my_projects: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_my_projects',
      description:
        'List all projects created/owned by the authenticated user (including drafts, open, in_progress, and closed).',
    },
  },

  // =========================================================================
  // FREELANCER TOOLS (4)
  // =========================================================================
  search_freelancers: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'search_freelancers',
      description:
        'Search the Firework AI freelancer directory by keyword, skill, category, availability, or experience level and rank matches.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING },
          skill: { type: Type.STRING },
          category: { type: Type.STRING },
          availability: { type: Type.STRING, description: 'available, busy, or offline' },
          experienceLevel: { type: Type.STRING },
        },
      },
    },
  },
  get_freelancer_profile: {
    tier: 'read',
    declaration: {
      name: 'get_freelancer_profile',
      description: 'Fetch a specific freelancer public profile by their UID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          freelancerUid: { type: Type.STRING },
        },
        required: ['freelancerUid'],
      },
    },
  },
  get_freelancer_portfolio: {
    tier: 'read',
    declaration: {
      name: 'get_freelancer_portfolio',
      description: 'Retrieve portfolio projects and work history for a specific freelancer by UID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          freelancerUid: { type: Type.STRING },
        },
        required: ['freelancerUid'],
      },
    },
  },
  save_freelancer: {
    tier: 'reversible',
    declaration: {
      name: 'save_freelancer',
      description: 'Save or unsave a freelancer profile in the user saved items list.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          freelancerUid: { type: Type.STRING },
        },
        required: ['freelancerUid'],
      },
    },
  },

  // =========================================================================
  // PROPOSAL TOOLS (5)
  // =========================================================================
  create_proposal: {
    tier: 'read',
    declaration: {
      name: 'create_proposal',
      description:
        'Validate and prepare a structured proposal draft for an open project without submitting it yet.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER },
          approach: { type: Type.STRING, description: 'Proposed delivery plan (min 15 chars)' },
          estimatedDuration: { type: Type.STRING },
          proposedBudget: { type: Type.NUMBER },
        },
        required: ['projectId', 'approach', 'estimatedDuration', 'proposedBudget'],
      },
    },
  },
  submit_proposal: {
    tier: 'consequential',
    declaration: {
      name: 'submit_proposal',
      description:
        'Submit a binding proposal to an open project in PostgreSQL. Requires confirmed=true after user confirmation.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.INTEGER },
          approach: { type: Type.STRING },
          estimatedDuration: { type: Type.STRING },
          proposedBudget: { type: Type.NUMBER },
          confirmed: { type: Type.BOOLEAN },
        },
        required: ['projectId', 'approach', 'estimatedDuration', 'proposedBudget'],
      },
    },
  },
  get_proposals: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_proposals',
      description: 'List proposals submitted by and received by the authenticated user.',
    },
  },
  accept_proposal: {
    tier: 'consequential',
    declaration: {
      name: 'accept_proposal',
      description:
        'Accept a freelancer proposal on a project owned by the authenticated client and create an active engagement. Requires confirmed=true.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          proposalId: { type: Type.INTEGER },
          confirmed: { type: Type.BOOLEAN },
        },
        required: ['proposalId'],
      },
    },
  },
  reject_proposal: {
    tier: 'consequential',
    declaration: {
      name: 'reject_proposal',
      description:
        'Reject a received proposal on a project owned by the authenticated client. Requires confirmed=true.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          proposalId: { type: Type.INTEGER },
          confirmed: { type: Type.BOOLEAN },
        },
        required: ['proposalId'],
      },
    },
  },

  // =========================================================================
  // TASK TOOLS (5)
  // =========================================================================
  create_task: {
    tier: 'reversible',
    liveEnabled: true,
    declaration: {
      name: 'create_task',
      description: 'Create a persistent task record in PostgreSQL for the authenticated user.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Task title (min 2 chars)' },
          description: { type: Type.STRING, description: 'Optional task notes' },
          priority: { type: Type.STRING, description: 'low, medium, or high' },
          dueDate: { type: Type.STRING, description: 'Due date in YYYY-MM-DD format' },
          projectId: { type: Type.INTEGER, description: 'Optional linked project ID' },
        },
        required: ['title'],
      },
    },
  },
  update_task: {
    tier: 'reversible',
    liveEnabled: true,
    declaration: {
      name: 'update_task',
      description: 'Update title, description, status, priority, or dueDate of a task owned by or assigned to the user.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.INTEGER },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          status: { type: Type.STRING, description: 'todo, in_progress, review, or completed' },
          priority: { type: Type.STRING, description: 'low, medium, or high' },
          dueDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
        },
        required: ['taskId'],
      },
    },
  },
  delete_task: {
    tier: 'consequential',
    declaration: {
      name: 'delete_task',
      description: 'Permanently delete a task owned by the authenticated user. Requires confirmed=true.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.INTEGER },
          confirmed: { type: Type.BOOLEAN },
        },
        required: ['taskId'],
      },
    },
  },
  get_tasks: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_tasks',
      description: 'Retrieve the authenticated user tasks, optionally filtered by status or projectId.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, description: 'all, todo, in_progress, review, or completed' },
          projectId: { type: Type.INTEGER, description: 'Optional project ID filter' },
        },
      },
    },
  },
  complete_task: {
    tier: 'reversible',
    liveEnabled: true,
    declaration: {
      name: 'complete_task',
      description: 'Mark an existing task belonging to the authenticated user as completed.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: { type: Type.INTEGER },
        },
        required: ['taskId'],
      },
    },
  },

  // =========================================================================
  // MESSAGING TOOLS (3)
  // =========================================================================
  get_conversations: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_conversations',
      description: 'List the authenticated user direct message conversations and unread counts.',
    },
  },
  get_messages: {
    tier: 'read',
    declaration: {
      name: 'get_messages',
      description: 'Retrieve messages inside a conversation where the authenticated user is a participant.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          conversationId: { type: Type.INTEGER },
        },
        required: ['conversationId'],
      },
    },
  },
  send_message: {
    tier: 'consequential',
    declaration: {
      name: 'send_message',
      description:
        'Send a direct message to another Firework AI user. Consequential action: requires confirmed=true.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          recipientUid: { type: Type.STRING },
          conversationId: { type: Type.INTEGER },
          body: { type: Type.STRING },
          confirmed: { type: Type.BOOLEAN },
        },
        required: ['body'],
      },
    },
  },

  // =========================================================================
  // NOTIFICATION TOOLS (2)
  // =========================================================================
  get_notifications: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_notifications',
      description: 'Retrieve recent notifications for the authenticated user.',
    },
  },
  mark_notification_read: {
    tier: 'reversible',
    declaration: {
      name: 'mark_notification_read',
      description: 'Mark a specific notification (or all notifications when notificationId is omitted) as read.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          notificationId: { type: Type.INTEGER, description: 'Optional notification ID' },
        },
      },
    },
  },

  // =========================================================================
  // WORKSPACE TOOLS (5)
  // =========================================================================
  get_dashboard_data: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_dashboard_data',
      description: 'Retrieve live database KPI counts, upcoming deadlines, and recommendations for the user.',
    },
  },
  get_active_projects: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_active_projects',
      description: 'Retrieve active client/freelancer engagements and their milestone progress.',
    },
  },
  get_workspace_summary: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'get_workspace_summary',
      description:
        'Produce a consolidated operational summary of the user mode, active engagements, open tasks, unread messages, and pending proposals.',
    },
  },
  search_platform: {
    tier: 'read',
    liveEnabled: true,
    declaration: {
      name: 'search_platform',
      description: 'Unified search across open projects, freelancers, user tasks, and saved items.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING },
        },
        required: ['query'],
      },
    },
  },
  navigate_to_page: {
    tier: 'reversible',
    liveEnabled: true,
    declaration: {
      name: 'navigate_to_page',
      description: `Navigate the Firework AI interface to a specific section. Valid pages: ${VALID_PAGES.join(', ')}.`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          page: { type: Type.STRING, description: `One of: ${VALID_PAGES.join(', ')}` },
        },
        required: ['page'],
      },
    },
  },
};

export const lensToolDeclarations: FunctionDeclaration[] = Object.values(LENS_TOOL_REGISTRY).map(
  (entry) => entry.declaration,
);

export const liveVoiceToolDeclarations: FunctionDeclaration[] = Object.values(LENS_TOOL_REGISTRY)
  .filter((entry) => entry.liveEnabled)
  .map((entry) => entry.declaration);

function requirePositiveInt(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return num;
}

export async function executeLensTool(params: {
  uid: string;
  conversationId?: number | null;
  requestId: string;
  name: string;
  rawArgs: Record<string, unknown>;
  clientActions: LensClientAction[];
  pendingConfirmations: PendingConfirmation[];
}): Promise<{ trace: ToolExecutionTrace; result: Record<string, unknown> }> {
  const { uid, conversationId, requestId, name, clientActions, pendingConfirmations } = params;
  const args = params.rawArgs ?? {};
  const startedAt = Date.now();

  if (!uid) {
    throw new Error('Authenticated user identity is required to execute Lens AI tools.');
  }

  try {
    let result: Record<string, unknown> = {};
    let summary = '';
    let status: ToolExecutionTrace['status'] = 'success';
    let navigationTarget: string | undefined;

    switch (name) {
      // ---------------- USER TOOLS ----------------
      case 'get_user_profile': {
        const user = await queries.getUserByUid(uid);
        if (!user) throw new Error('User profile not found.');
        result = { user };
        summary = `Loaded profile for ${user.fullName}`;
        break;
      }
      case 'update_user_profile': {
        const updated = await queries.updateUserProfile(uid, {
          fullName: typeof args.fullName === 'string' && args.fullName.trim() ? args.fullName : undefined,
          title: typeof args.title === 'string' ? args.title : undefined,
          bio: typeof args.bio === 'string' ? args.bio : undefined,
          country: typeof args.country === 'string' ? args.country : undefined,
          availability:
            args.availability === 'available' ||
            args.availability === 'busy' ||
            args.availability === 'offline'
              ? args.availability
              : undefined,
          hourlyRate:
            typeof args.hourlyRate === 'number' && Number.isFinite(args.hourlyRate)
              ? Math.max(0, Math.round(args.hourlyRate))
              : undefined,
          skills: Array.isArray(args.skills)
            ? args.skills.filter((s): s is string => typeof s === 'string')
            : undefined,
        });
        result = { user: updated };
        summary = 'Updated profile details in PostgreSQL';
        clientActions.push({ type: 'data_mutated', scope: 'profile' });
        break;
      }
      case 'get_user_preferences': {
        const user = await queries.getUserByUid(uid);
        if (!user) throw new Error('User profile not found.');
        result = { preferences: user.preferences, preferredLanguage: user.preferredLanguage };
        summary = 'Loaded user preferences';
        break;
      }
      case 'update_user_preferences': {
        const patch: Partial<UserPreferences> = {};
        if (args.theme === 'system' || args.theme === 'light' || args.theme === 'dark') {
          patch.theme = args.theme;
        }
        if (args.density === 'comfortable' || args.density === 'compact') {
          patch.density = args.density;
        }
        if (typeof args.sleepModeMuteNonEssential === 'boolean') {
          patch.sleepModeMuteNonEssential = args.sleepModeMuteNonEssential;
        }
        if (typeof args.notifyMessages === 'boolean') patch.notifyMessages = args.notifyMessages;
        if (typeof args.notifyProjects === 'boolean') patch.notifyProjects = args.notifyProjects;
        if (typeof args.notifyProposals === 'boolean') patch.notifyProposals = args.notifyProposals;
        if (typeof args.notifyDeadlines === 'boolean') patch.notifyDeadlines = args.notifyDeadlines;
        if (
          args.profileVisibility === 'public' ||
          args.profileVisibility === 'members' ||
          args.profileVisibility === 'private'
        ) {
          patch.profileVisibility = args.profileVisibility;
        }
        if (typeof args.discoverable === 'boolean') patch.discoverable = args.discoverable;
        if (
          args.aiResponseStyle === 'concise' ||
          args.aiResponseStyle === 'detailed' ||
          args.aiResponseStyle === 'technical'
        ) {
          patch.aiResponseStyle = args.aiResponseStyle;
        }
        if (typeof args.aiUseContext === 'boolean') patch.aiUseContext = args.aiUseContext;

        const updated = await queries.updateUserProfile(uid, { preferences: patch });
        result = { preferences: updated?.preferences };
        summary = `Updated ${Object.keys(patch).length} preference setting(s)`;
        clientActions.push({ type: 'data_mutated', scope: 'profile' });
        break;
      }
      case 'get_user_mode': {
        const user = await queries.getUserByUid(uid);
        result = { mode: user?.mode ?? 'work', availability: user?.availability ?? 'available' };
        summary = `Current mode: ${user?.mode ?? 'work'}`;
        break;
      }
      case 'set_user_mode': {
        const mode = args.mode === 'sleep' ? 'sleep' : args.mode === 'work' ? 'work' : null;
        if (!mode) throw new Error('Mode must be "work" or "sleep".');
        const updated = await queries.setUserMode(uid, mode);
        result = { mode: updated.mode, availability: updated.availability, verified: true };
        summary = mode === 'sleep' ? 'Activated Sleep Mode' : 'Switched to Work Mode';
        clientActions.push({ type: 'mode_changed', mode });
        break;
      }

      // ---------------- PROJECT TOOLS ----------------
      case 'search_projects': {
        const user = await queries.getUserByUid(uid);
        const requestedLimit =
          typeof args.limit === 'number' && args.limit > 0 ? Math.min(20, Math.round(args.limit)) : 12;
        const found = await queries.searchProjects({
          query: typeof args.query === 'string' ? args.query : undefined,
          category: typeof args.category === 'string' ? args.category : undefined,
          skill: typeof args.skill === 'string' ? args.skill : undefined,
          experienceLevel:
            typeof args.experienceLevel === 'string' ? args.experienceLevel : undefined,
          budgetMin: typeof args.budgetMin === 'number' ? args.budgetMin : undefined,
          budgetMax: typeof args.budgetMax === 'number' ? args.budgetMax : undefined,
          status: 'open',
          limit: requestedLimit,
        });
        const ranked = found
          .map((p) => ({
            ...p,
            relevanceScore: computeSkillMatchRatio(user?.skills ?? [], p.skills ?? []),
          }))
          .sort((a, b) => b.relevanceScore - a.relevanceScore);
        result = { count: ranked.length, projects: ranked };
        summary = `Found ${ranked.length} open project(s)`;
        break;
      }
      case 'get_project_details': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const project = await queries.getProjectDetails(projectId);
        if (!project) throw new Error(`Project #${projectId} not found.`);
        result = { project };
        summary = `Loaded project "${project.title}"`;
        break;
      }
      case 'create_project': {
        const validation = validateProjectInput({
          title: String(args.title ?? ''),
          description: String(args.description ?? ''),
          category: String(args.category ?? ''),
          budgetMin: Number(args.budgetMin ?? 0),
          budgetMax: args.budgetMax !== undefined ? Number(args.budgetMax) : null,
          duration: String(args.duration ?? ''),
        });
        if (!validation.valid) {
          throw new Error(Object.values(validation.errors).join(' '));
        }
        // Create as a real draft first so user can review & explicitly confirm publication
        const created = await queries.createProject(uid, {
          title: String(args.title),
          description: String(args.description),
          category: String(args.category),
          skills: Array.isArray(args.skills)
            ? args.skills.filter((s): s is string => typeof s === 'string')
            : [],
          budgetType: args.budgetType === 'hourly' ? 'hourly' : 'fixed',
          budgetMin: Number(args.budgetMin),
          budgetMax: args.budgetMax ? Number(args.budgetMax) : null,
          duration: String(args.duration),
          experienceLevel: typeof args.experienceLevel === 'string' ? args.experienceLevel : 'mid',
          projectType: 'one-time',
          remote: true,
          requirements: typeof args.requirements === 'string' ? args.requirements : '',
          deadline: typeof args.deadline === 'string' ? args.deadline : null,
          status: 'draft',
        });
        result = { project: created, status: 'draft' };
        summary = `Created project draft "${created.title}" (#${created.id})`;
        clientActions.push({ type: 'data_mutated', scope: 'projects' });
        break;
      }
      case 'update_project': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const user = await queries.getUserByUid(uid);
        const updated = await queries.updateProject(projectId, uid, user?.role === 'admin', {
          title: typeof args.title === 'string' ? args.title : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
          duration: typeof args.duration === 'string' ? args.duration : undefined,
          budgetMin: typeof args.budgetMin === 'number' ? Math.round(args.budgetMin) : undefined,
          budgetMax: typeof args.budgetMax === 'number' ? Math.round(args.budgetMax) : undefined,
          deadline: typeof args.deadline === 'string' ? args.deadline : undefined,
        });
        result = { project: updated };
        summary = `Updated project #${updated.id}`;
        clientActions.push({ type: 'data_mutated', scope: 'projects' });
        break;
      }
      case 'publish_project': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const existing = await queries.getProjectDetails(projectId);
        if (!existing) throw new Error(`Project #${projectId} not found.`);
        const user = await queries.getUserByUid(uid);
        if (existing.clientUid !== uid && user?.role !== 'admin') {
          throw new Error('You do not have permission to publish this project.');
        }
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = `Confirmation required to publish "${existing.title}" (#${projectId})`;
          pendingConfirmations.push({
            toolName: 'publish_project',
            args: { projectId, confirmed: true },
            description: `Publish project "${existing.title}" (#${projectId}) to the public Firework AI marketplace?`,
          });
          result = { requiresConfirmation: true, projectId, title: existing.title, message: summary };
          break;
        }
        const published = await queries.updateProject(projectId, uid, user?.role === 'admin', {
          status: 'open',
        });
        result = { project: published, published: true };
        summary = `Published project "${published.title}" (#${published.id})`;
        clientActions.push({ type: 'data_mutated', scope: 'projects' });
        break;
      }
      case 'archive_project': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const existing = await queries.getProjectDetails(projectId);
        if (!existing) throw new Error(`Project #${projectId} not found.`);
        const user = await queries.getUserByUid(uid);
        if (existing.clientUid !== uid && user?.role !== 'admin') {
          throw new Error('You do not have permission to archive this project.');
        }
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = `Confirmation required to archive "${existing.title}" (#${projectId})`;
          pendingConfirmations.push({
            toolName: 'archive_project',
            args: { projectId, confirmed: true },
            description: `Archive project "${existing.title}" (#${projectId}) and close it to new proposals?`,
          });
          result = { requiresConfirmation: true, projectId, message: summary };
          break;
        }
        const archived = await queries.updateProject(projectId, uid, user?.role === 'admin', {
          status: 'closed',
        });
        result = { project: archived, archived: true };
        summary = `Archived project "${archived.title}" (#${archived.id})`;
        clientActions.push({ type: 'data_mutated', scope: 'projects' });
        break;
      }
      case 'save_project': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const saved = await queries.toggleSavedItem(uid, 'project', String(projectId));
        result = saved;
        summary = saved.saved
          ? `Saved project #${projectId}`
          : `Removed project #${projectId} from saved items`;
        clientActions.push({ type: 'data_mutated', scope: 'saved' });
        break;
      }
      case 'get_my_projects': {
        const mine = await queries.searchProjects({ clientUid: uid, status: 'all', limit: 25 });
        result = { count: mine.length, projects: mine };
        summary = `Retrieved ${mine.length} owned project(s)`;
        break;
      }

      // ---------------- FREELANCER TOOLS ----------------
      case 'search_freelancers': {
        const list = await queries.searchFreelancers({
          query: typeof args.query === 'string' ? args.query : undefined,
          skill: typeof args.skill === 'string' ? args.skill : undefined,
          category: typeof args.category === 'string' ? args.category : undefined,
          availability: typeof args.availability === 'string' ? args.availability : undefined,
          experienceLevel:
            typeof args.experienceLevel === 'string' ? args.experienceLevel : undefined,
          limit: 12,
        });
        const targetSkills = [
          ...(typeof args.skill === 'string' ? [args.skill] : []),
          ...(typeof args.query === 'string' ? args.query.split(/\s+/) : []),
        ].filter(Boolean);
        const ranked = list
          .map((f) => ({
            ...f,
            matchScore:
              targetSkills.length > 0
                ? computeSkillMatchRatio(f.skills ?? [], targetSkills)
                : f.availability === 'available'
                  ? 1
                  : 0.5,
          }))
          .sort((a, b) => b.matchScore - a.matchScore);
        result = { count: ranked.length, freelancers: ranked };
        summary = `Found ${ranked.length} freelancer(s)`;
        break;
      }
      case 'get_freelancer_profile': {
        const targetUid = String(args.freelancerUid ?? '').trim();
        if (!targetUid) throw new Error('freelancerUid is required.');
        const freelancer = await queries.getUserByUid(targetUid);
        if (!freelancer) throw new Error('Freelancer profile not found.');
        if (freelancer.preferences?.profileVisibility === 'private' && freelancer.uid !== uid) {
          throw new Error('This profile is private.');
        }
        result = {
          freelancer: {
            uid: freelancer.uid,
            fullName: freelancer.fullName,
            title: freelancer.title,
            bio: freelancer.bio,
            country: freelancer.country,
            hourlyRate: freelancer.hourlyRate,
            experienceLevel: freelancer.experienceLevel,
            skills: freelancer.skills,
            availability: freelancer.availability,
            socialLinks: freelancer.socialLinks,
          },
        };
        summary = `Loaded profile for ${freelancer.fullName}`;
        break;
      }
      case 'get_freelancer_portfolio': {
        const targetUid = String(args.freelancerUid ?? '').trim();
        if (!targetUid) throw new Error('freelancerUid is required.');
        const freelancer = await queries.getUserByUid(targetUid);
        if (!freelancer) throw new Error('Freelancer not found.');
        if (freelancer.preferences?.profileVisibility === 'private' && freelancer.uid !== uid) {
          throw new Error('This portfolio is private.');
        }
        result = {
          freelancerUid: freelancer.uid,
          fullName: freelancer.fullName,
          portfolio: freelancer.portfolio ?? [],
          workHistory: freelancer.workHistory ?? [],
        };
        summary = `Loaded ${(freelancer.portfolio ?? []).length} portfolio item(s) for ${freelancer.fullName}`;
        break;
      }
      case 'save_freelancer': {
        const targetUid = String(args.freelancerUid ?? '').trim();
        if (!targetUid) throw new Error('freelancerUid is required.');
        const saved = await queries.toggleSavedItem(uid, 'freelancer', targetUid);
        result = saved;
        summary = saved.saved
          ? `Saved freelancer ${targetUid}`
          : `Removed freelancer ${targetUid} from saved items`;
        clientActions.push({ type: 'data_mutated', scope: 'saved' });
        break;
      }

      // ---------------- PROPOSAL TOOLS ----------------
      case 'create_proposal': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const project = await queries.getProjectDetails(projectId);
        if (!project) throw new Error(`Project #${projectId} not found.`);
        if (project.status !== 'open') {
          throw new Error(`Project #${projectId} is not open for proposals (${project.status}).`);
        }
        const validation = validateProposalInput({
          projectId,
          approach: String(args.approach ?? ''),
          estimatedDuration: String(args.estimatedDuration ?? ''),
          proposedBudget: Number(args.proposedBudget ?? 0),
        });
        if (!validation.valid) {
          throw new Error(Object.values(validation.errors).join(' '));
        }
        result = {
          draft: {
            projectId,
            projectTitle: project.title,
            approach: String(args.approach),
            estimatedDuration: String(args.estimatedDuration),
            proposedBudget: Number(args.proposedBudget),
          },
          readyToSubmit: true,
        };
        summary = `Prepared proposal draft for "${project.title}"`;
        break;
      }
      case 'submit_proposal': {
        const projectId = requirePositiveInt(args.projectId, 'projectId');
        const validation = validateProposalInput({
          projectId,
          approach: String(args.approach ?? ''),
          estimatedDuration: String(args.estimatedDuration ?? ''),
          proposedBudget: Number(args.proposedBudget ?? 0),
        });
        if (!validation.valid) {
          throw new Error(Object.values(validation.errors).join(' '));
        }
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = `Confirmation required to submit proposal for project #${projectId}`;
          pendingConfirmations.push({
            toolName: 'submit_proposal',
            args: { ...args, projectId, confirmed: true },
            description: `Submit proposal of $${args.proposedBudget} (${args.estimatedDuration}) for project #${projectId}?`,
          });
          result = { requiresConfirmation: true, message: summary };
          break;
        }
        const proposal = await queries.submitProposal(uid, {
          projectId,
          approach: String(args.approach),
          estimatedDuration: String(args.estimatedDuration),
          proposedBudget: Number(args.proposedBudget),
        });
        result = { proposal };
        summary = `Submitted proposal #${proposal.id}`;
        clientActions.push({ type: 'data_mutated', scope: 'proposals' });
        break;
      }
      case 'get_proposals': {
        const data = await queries.listUserProposals(uid);
        result = {
          sentCount: data.sent.length,
          receivedCount: data.received.length,
          sent: data.sent,
          received: data.received,
        };
        summary = `Loaded ${data.sent.length} sent and ${data.received.length} received proposal(s)`;
        break;
      }
      case 'accept_proposal': {
        const proposalId = requirePositiveInt(args.proposalId, 'proposalId');
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = `Confirmation required to accept proposal #${proposalId}`;
          pendingConfirmations.push({
            toolName: 'accept_proposal',
            args: { proposalId, confirmed: true },
            description: `Accept proposal #${proposalId} and activate an engagement with milestones?`,
          });
          result = { requiresConfirmation: true, proposalId, message: summary };
          break;
        }
        const updated = await queries.updateProposalStatus(proposalId, uid, 'accepted');
        result = updated;
        summary = `Accepted proposal #${proposalId} and started engagement`;
        clientActions.push({ type: 'data_mutated', scope: 'proposals' });
        break;
      }
      case 'reject_proposal': {
        const proposalId = requirePositiveInt(args.proposalId, 'proposalId');
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = `Confirmation required to reject proposal #${proposalId}`;
          pendingConfirmations.push({
            toolName: 'reject_proposal',
            args: { proposalId, confirmed: true },
            description: `Reject proposal #${proposalId}?`,
          });
          result = { requiresConfirmation: true, proposalId, message: summary };
          break;
        }
        const updated = await queries.updateProposalStatus(proposalId, uid, 'rejected');
        result = updated;
        summary = `Rejected proposal #${proposalId}`;
        clientActions.push({ type: 'data_mutated', scope: 'proposals' });
        break;
      }

      // ---------------- TASK TOOLS ----------------
      case 'create_task': {
        const validation = validateTaskInput({
          title: String(args.title ?? ''),
          priority: typeof args.priority === 'string' ? args.priority : 'medium',
          dueDate: typeof args.dueDate === 'string' ? args.dueDate : null,
        });
        if (!validation.valid) {
          throw new Error(Object.values(validation.errors).join(' '));
        }
        const created = await queries.createTask(uid, {
          title: String(args.title),
          description: typeof args.description === 'string' ? args.description : '',
          priority: typeof args.priority === 'string' ? args.priority : 'medium',
          dueDate: typeof args.dueDate === 'string' ? args.dueDate : null,
          projectId: args.projectId ? Number(args.projectId) : null,
        });
        result = { task: created };
        summary = `Created task "${created.title}" (#${created.id})`;
        clientActions.push({ type: 'data_mutated', scope: 'tasks' });
        break;
      }
      case 'update_task': {
        const taskId = requirePositiveInt(args.taskId, 'taskId');
        const updated = await queries.updateTask(taskId, uid, {
          title: typeof args.title === 'string' ? args.title : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
          status: typeof args.status === 'string' ? args.status : undefined,
          priority: typeof args.priority === 'string' ? args.priority : undefined,
          dueDate: typeof args.dueDate === 'string' ? args.dueDate : undefined,
        });
        result = { task: updated };
        summary = `Updated task "${updated.title}" (${updated.status})`;
        clientActions.push({ type: 'data_mutated', scope: 'tasks' });
        break;
      }
      case 'complete_task': {
        const taskId = requirePositiveInt(args.taskId, 'taskId');
        const updated = await queries.updateTask(taskId, uid, { status: 'completed' });
        result = { task: updated };
        summary = `Marked task "${updated.title}" as completed`;
        clientActions.push({ type: 'data_mutated', scope: 'tasks' });
        break;
      }
      case 'delete_task': {
        const taskId = requirePositiveInt(args.taskId, 'taskId');
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = `Confirmation required to delete task #${taskId}`;
          pendingConfirmations.push({
            toolName: 'delete_task',
            args: { taskId, confirmed: true },
            description: `Permanently delete task #${taskId}?`,
          });
          result = { requiresConfirmation: true, taskId, message: summary };
          break;
        }
        const deleted = await queries.deleteTask(taskId, uid);
        result = deleted;
        summary = `Deleted task #${taskId}`;
        clientActions.push({ type: 'data_mutated', scope: 'tasks' });
        break;
      }
      case 'get_tasks': {
        const list = await queries.listTasks(uid, {
          status: typeof args.status === 'string' ? args.status : undefined,
          projectId: args.projectId ? Number(args.projectId) : undefined,
        });
        result = { count: list.length, tasks: list };
        summary = `Retrieved ${list.length} task(s)`;
        break;
      }

      // ---------------- MESSAGING TOOLS ----------------
      case 'get_conversations': {
        const list = await queries.listConversations(uid);
        result = { count: list.length, conversations: list };
        summary = `Loaded ${list.length} conversation(s)`;
        break;
      }
      case 'get_messages': {
        const convId = requirePositiveInt(args.conversationId, 'conversationId');
        const list = await queries.listMessages(convId, uid);
        result = { count: list.length, messages: list.slice(-25) };
        summary = `Loaded ${list.length} message(s) from conversation #${convId}`;
        break;
      }
      case 'send_message': {
        const body = String(args.body ?? '').trim();
        if (!body) throw new Error('Message body is required.');
        if (!args.recipientUid && !args.conversationId) {
          throw new Error('Either recipientUid or conversationId is required.');
        }
        if (args.confirmed !== true) {
          status = 'requires_confirmation';
          summary = 'Confirmation required to send direct message';
          pendingConfirmations.push({
            toolName: 'send_message',
            args: { ...args, confirmed: true },
            description: `Send direct message: "${body.slice(0, 90)}${body.length > 90 ? '...' : ''}"?`,
          });
          result = { requiresConfirmation: true, message: summary };
          break;
        }
        const msg = await queries.sendMessage({
          senderUid: uid,
          conversationId: args.conversationId ? Number(args.conversationId) : undefined,
          recipientUid: typeof args.recipientUid === 'string' ? args.recipientUid : undefined,
          body,
        });
        result = { message: msg };
        summary = 'Sent direct message';
        clientActions.push({ type: 'data_mutated', scope: 'messages' });
        break;
      }

      // ---------------- NOTIFICATION TOOLS ----------------
      case 'get_notifications': {
        const list = await queries.listNotifications(uid);
        result = { count: list.length, unread: list.filter((n) => !n.read).length, notifications: list };
        summary = `Retrieved ${list.length} notification(s)`;
        break;
      }
      case 'mark_notification_read': {
        await queries.markNotificationRead(
          uid,
          args.notificationId ? Number(args.notificationId) : undefined,
        );
        result = { ok: true };
        summary = args.notificationId
          ? `Marked notification #${args.notificationId} read`
          : 'Marked all notifications read';
        clientActions.push({ type: 'data_mutated', scope: 'notifications' });
        break;
      }

      // ---------------- WORKSPACE TOOLS ----------------
      case 'get_dashboard_data': {
        const data = await queries.getDashboardData(uid);
        result = {
          stats: data.stats,
          mode: data.user.mode,
          accountType: data.user.accountType,
          upcomingDeadlines: data.upcomingDeadlines,
        };
        summary = 'Loaded workspace dashboard metrics';
        break;
      }
      case 'get_active_projects': {
        const list = await queries.listEngagements(uid);
        const active = list.filter((e) => e.status === 'active');
        result = { count: active.length, engagements: active };
        summary = `Retrieved ${active.length} active engagement(s)`;
        break;
      }
      case 'get_workspace_summary': {
        const data = await queries.getDashboardData(uid);
        result = {
          mode: data.user.mode,
          availability: data.user.availability,
          accountType: data.user.accountType,
          stats: data.stats,
          activeEngagements: data.activeEngagements.map((e) => ({
            id: e.id,
            title: e.projectTitle,
            progress: e.progress,
            status: e.status,
          })),
          upcomingDeadlines: data.upcomingDeadlines.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            priority: t.priority,
          })),
        };
        summary = 'Compiled operational workspace summary';
        break;
      }
      case 'search_platform': {
        const found = await queries.searchPlatform(String(args.query ?? ''), uid);
        result = found;
        summary = `Found ${found.projects.length} projects, ${found.freelancers.length} freelancers, ${found.tasks.length} tasks`;
        break;
      }
      case 'navigate_to_page': {
        const page = String(args.page ?? '').trim();
        if (!(VALID_PAGES as readonly string[]).includes(page)) {
          throw new Error(`Unsupported page "${page}". Valid pages: ${VALID_PAGES.join(', ')}.`);
        }
        navigationTarget = page;
        clientActions.push({ type: 'navigate', page });
        result = { navigated: true, page };
        summary = `Navigated to ${page}`;
        break;
      }
      default:
        throw new Error(`Unknown Lens AI tool "${name}".`);
    }

    await queries.recordToolExecution({
      userUid: uid,
      conversationId: conversationId ?? null,
      toolName: name,
      args,
      status,
      resultSummary: summary,
    });

    logAiDiagnostic({
      requestId,
      conversationId: conversationId ?? null,
      durationMs: Date.now() - startedAt,
      toolName: name,
      toolStatus: status,
      detail: summary,
    });

    return {
      trace: { toolName: name, args, status, summary, navigationTarget },
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed.';
    await queries.recordToolExecution({
      userUid: uid,
      conversationId: conversationId ?? null,
      toolName: name,
      args,
      status: 'error',
      resultSummary: message,
    });

    logAiDiagnostic({
      requestId,
      conversationId: conversationId ?? null,
      durationMs: Date.now() - startedAt,
      toolName: name,
      toolStatus: 'error',
      errorCategory: 'tool',
      detail: message,
    });

    return {
      trace: { toolName: name, args, status: 'error', summary: message },
      result: { error: message },
    };
  }
}
