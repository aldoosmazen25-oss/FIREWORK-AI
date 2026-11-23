import * as queries from '../db/queries.ts';
import type { UserPreferences } from '../db/schema.ts';

export interface LensSessionContextInput {
  uid: string;
  language: 'en' | 'ar';
  currentPage?: string;
  selectedProjectId?: number | null;
}

export interface LensApplicationContext {
  todayIso: string;
  language: 'en' | 'ar';
  persistentPreferences: {
    aiResponseStyle: UserPreferences['aiResponseStyle'];
    aiUseContext: boolean;
    sleepModeMuteNonEssential: boolean;
    preferredLanguage: string;
  };
  sessionState: {
    currentPage: string;
    selectedProjectId: number | null;
    mode: string;
    availability: string;
  };
  userSummary: {
    fullName: string;
    accountType: string;
    role: string;
    title: string;
    skills: string[];
    country: string;
  } | null;
  workspaceSnapshot: {
    openTasksCount: number;
    activeEngagementsCount: number;
    publishedProjectsCount: number;
    unreadNotificationsCount: number;
    topPendingTasks: Array<{ id: number; title: string; priority: string; dueDate: string | null }>;
    activeProjects: Array<{ engagementId: number; projectId: number; title: string; progress: number }>;
  } | null;
}

/**
 * Application Context Engine:
 * Retrieves ONLY bounded, permission-scoped operational context needed for the
 * authenticated user's turn. Respects aiUseContext privacy setting and never
 * dumps the full database to Gemini.
 */
export async function buildLensApplicationContext(
  input: LensSessionContextInput,
): Promise<LensApplicationContext> {
  const user = await queries.getUserByUid(input.uid);
  if (!user) {
    throw new Error('Authenticated user profile not found.');
  }

  const prefs = user.preferences;
  const aiUseContext = prefs?.aiUseContext !== false;
  const todayIso = new Date().toISOString().slice(0, 10);

  const base: LensApplicationContext = {
    todayIso,
    language: input.language,
    persistentPreferences: {
      aiResponseStyle: prefs?.aiResponseStyle ?? 'concise',
      aiUseContext,
      sleepModeMuteNonEssential: prefs?.sleepModeMuteNonEssential ?? true,
      preferredLanguage: user.preferredLanguage ?? 'en',
    },
    sessionState: {
      currentPage: input.currentPage || 'home',
      selectedProjectId: input.selectedProjectId ?? null,
      mode: user.mode || 'work',
      availability: user.availability || 'available',
    },
    userSummary: null,
    workspaceSnapshot: null,
  };

  if (!aiUseContext) {
    return base;
  }

  const [userTasks, userEngagements, userProjects, userNotifications] = await Promise.all([
    queries.listTasks(input.uid),
    queries.listEngagements(input.uid),
    queries.searchProjects({ clientUid: input.uid, status: 'all', limit: 10 }),
    queries.listNotifications(input.uid),
  ]);

  const openTasks = userTasks.filter((t) => t.status !== 'completed');
  const activeEngagements = userEngagements.filter((e) => e.status === 'active');

  base.userSummary = {
    fullName: user.fullName,
    accountType: user.accountType,
    role: user.role,
    title: user.title,
    skills: (user.skills ?? []).slice(0, 20),
    country: user.country,
  };

  base.workspaceSnapshot = {
    openTasksCount: openTasks.length,
    activeEngagementsCount: activeEngagements.length,
    publishedProjectsCount: userProjects.length,
    unreadNotificationsCount: userNotifications.filter((n) => !n.read).length,
    topPendingTasks: openTasks.slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
    activeProjects: activeEngagements.slice(0, 5).map((e) => ({
      engagementId: e.id,
      projectId: e.projectId,
      title: e.projectTitle,
      progress: e.progress,
    })),
  };

  return base;
}

export function formatLensSystemInstruction(ctx: LensApplicationContext, isVoice = false): string {
  const lines: string[] = [
    isVoice
      ? 'You are Lens AI, the real-time voice operational agent inside Firework AI. Speak naturally, concisely, and clearly.'
      : 'You are Lens AI, the autonomous operational intelligence agent inside Firework AI.',
    `Today's date is ${ctx.todayIso}.`,
    `Primary language: ${ctx.language === 'ar' ? 'Arabic (respond in fluent, natural Arabic unless the user writes in another language)' : 'English (respond in clear, direct English unless the user writes in another language)'}.`,
    `Style preference: ${ctx.persistentPreferences.aiResponseStyle}. Be accurate, concise, and functional — zero marketing fluff.`,
    '',
    'OPERATIONAL RULES:',
    '1. Decide whether the user is asking a general question, requesting workspace data, requesting UI navigation, requesting a database mutation, or requesting a multi-step workflow. Do NOT call tools for simple conceptual or conversational questions.',
    '2. For ANY question about real Firework AI projects, freelancers, tasks, proposals, messages, notifications, preferences, or operating mode, ALWAYS invoke the appropriate tool(s) first and ground your answer strictly in verified tool outputs.',
    '3. NEVER fabricate projects, freelancers, messages, tasks, or claim an action succeeded unless a tool returned verified success.',
    '4. For multi-step workflows (e.g., "Switch to Work Mode and show me my pending tasks", or "Find web dev projects and save the best one"), execute each dependent tool step cleanly in sequence.',
    '5. When preparing a new project for publication: collect or validate required fields (title, description, category, budgetMin, duration), call create_project to save a real DRAFT in PostgreSQL, display the draft clearly to the user, and call publish_project (without confirmed=true) to request explicit confirmation before publishing.',
    '6. Consequential operations (publish_project, archive_project, submit_proposal, accept_proposal, reject_proposal, send_message, delete_task) enforce server-side confirmation. Call them with confirmed=false when the user has not explicitly confirmed via the confirmation button.',
    '7. If essential details are missing or ambiguous, ask one brief, targeted clarifying question rather than guessing.',
    '8. If a tool returns an error, report the exact reason clearly and suggest the concrete next step.',
    '',
    `SESSION CONTEXT: currentPage="${ctx.sessionState.currentPage}", mode="${ctx.sessionState.mode}", availability="${ctx.sessionState.availability}"${ctx.sessionState.selectedProjectId ? `, selectedProjectId=${ctx.sessionState.selectedProjectId}` : ''}.`,
  ];

  if (ctx.userSummary && ctx.workspaceSnapshot) {
    lines.push(
      `AUTHENTICATED USER: name="${ctx.userSummary.fullName}", accountType="${ctx.userSummary.accountType}", title="${ctx.userSummary.title}", skills=${JSON.stringify(ctx.userSummary.skills)}.`,
      `WORKSPACE SNAPSHOT: openTasks=${ctx.workspaceSnapshot.openTasksCount}, activeEngagements=${ctx.workspaceSnapshot.activeEngagementsCount}, publishedProjects=${ctx.workspaceSnapshot.publishedProjectsCount}, unreadNotifications=${ctx.workspaceSnapshot.unreadNotificationsCount}.`,
    );
    if (ctx.workspaceSnapshot.activeProjects.length > 0) {
      lines.push(
        `ACTIVE ENGAGEMENTS: ${JSON.stringify(ctx.workspaceSnapshot.activeProjects)}`,
      );
    }
    if (ctx.workspaceSnapshot.topPendingTasks.length > 0) {
      lines.push(
        `TOP OPEN TASKS: ${JSON.stringify(ctx.workspaceSnapshot.topPendingTasks)}`,
      );
    }
  } else {
    lines.push(
      'NOTE: User has disabled automatic workspace context injection in Settings. Only use data explicitly retrieved when the user asks you to run a tool.',
    );
  }

  return lines.join('\n');
}
