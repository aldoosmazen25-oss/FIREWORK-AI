import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  activityLogs,
  aiConversations,
  aiMessages,
  aiToolExecutions,
  categories,
  conversations,
  DEFAULT_USER_PREFERENCES,
  engagements,
  messages,
  milestones,
  notifications,
  projects,
  proposals,
  reports,
  savedItems,
  tasks,
  users,
  workspaceNotes,
  type PortfolioItem,
  type SocialLinks,
  type ToolExecutionTrace,
  type UserPreferences,
  type WorkHistoryItem,
} from './schema.ts';
import {
  canTransitionProposal,
  computeEngagementProgress,
  computeSkillMatchRatio,
  resolveAvailabilityForMode,
  shouldDeliverNotification,
  type AppMode,
  type AvailabilityStatus,
  type ProposalStatus,
} from '../utils/domain.ts';

const ADMIN_EMAILS = new Set(['aldoosmazen25@gmail.com']);

function dbError(message: string, cause: unknown): Error {
  console.error(message, cause);
  return new Error(message, { cause });
}

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  fullName?: string;
  photoUrl?: string | null;
}) {
  try {
    const isAdminEmail = ADMIN_EMAILS.has(params.email.toLowerCase());
    const existing = await db.select().from(users).where(eq(users.uid, params.uid)).limit(1);
    if (existing.length > 0) {
      const current = existing[0];
      const nextRole = isAdminEmail ? 'admin' : current.role;
      const [updated] = await db
        .update(users)
        .set({
          email: params.email,
          photoUrl: params.photoUrl ?? current.photoUrl,
          role: nextRole,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, params.uid))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: params.email,
        fullName: params.fullName?.trim() || params.email.split('@')[0] || 'Firework Member',
        photoUrl: params.photoUrl ?? null,
        role: isAdminEmail ? 'admin' : 'user',
        preferences: DEFAULT_USER_PREFERENCES,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          updatedAt: new Date(),
        },
      })
      .returning();

    await logActivity({
      userUid: created.uid,
      action: 'account.created',
      entityType: 'user',
      entityId: created.uid,
      summary: `Joined Firework AI as ${created.accountType}`,
    });

    return created;
  } catch (error) {
    throw dbError('Unable to load or synchronize user account.', error);
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    throw dbError('Unable to fetch user profile.', error);
  }
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<{
    fullName: string;
    accountType: 'freelancer' | 'client';
    title: string;
    bio: string;
    country: string;
    preferredLanguage: 'en' | 'ar';
    availability: AvailabilityStatus;
    experienceLevel: string;
    hourlyRate: number | null;
    skills: string[];
    interests: string[];
    preferredCategories: string[];
    socialLinks: SocialLinks;
    portfolio: PortfolioItem[];
    workHistory: WorkHistoryItem[];
    preferences: Partial<UserPreferences>;
    onboardingCompleted: boolean;
  }>,
) {
  try {
    const existing = await getUserByUid(uid);
    if (!existing) throw new Error('User record not found.');

    const mergedPrefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      ...(existing.preferences ?? {}),
      ...(patch.preferences ?? {}),
    };

    const [updated] = await db
      .update(users)
      .set({
        fullName: patch.fullName !== undefined ? patch.fullName.trim() : existing.fullName,
        accountType: patch.accountType ?? existing.accountType,
        title: patch.title !== undefined ? patch.title.trim() : existing.title,
        bio: patch.bio !== undefined ? patch.bio.trim() : existing.bio,
        country: patch.country !== undefined ? patch.country.trim() : existing.country,
        preferredLanguage: patch.preferredLanguage ?? existing.preferredLanguage,
        availability: patch.availability ?? existing.availability,
        experienceLevel: patch.experienceLevel ?? existing.experienceLevel,
        hourlyRate: patch.hourlyRate !== undefined ? patch.hourlyRate : existing.hourlyRate,
        skills: patch.skills ?? existing.skills,
        interests: patch.interests ?? existing.interests,
        preferredCategories: patch.preferredCategories ?? existing.preferredCategories,
        socialLinks: patch.socialLinks ?? existing.socialLinks,
        portfolio: patch.portfolio ?? existing.portfolio,
        workHistory: patch.workHistory ?? existing.workHistory,
        preferences: mergedPrefs,
        onboardingCompleted:
          patch.onboardingCompleted !== undefined
            ? patch.onboardingCompleted
            : existing.onboardingCompleted,
        updatedAt: new Date(),
      })
      .where(eq(users.uid, uid))
      .returning();

    await logActivity({
      userUid: uid,
      action: 'profile.updated',
      entityType: 'user',
      entityId: uid,
      summary: 'Updated professional profile settings',
    });

    return updated;
  } catch (error) {
    throw dbError('Unable to update user profile.', error);
  }
}

export async function setUserMode(uid: string, mode: AppMode) {
  try {
    const existing = await getUserByUid(uid);
    if (!existing) throw new Error('User record not found.');

    const nextAvailability = resolveAvailabilityForMode(
      mode,
      (existing.availability as AvailabilityStatus) || 'available',
    );

    const [updated] = await db
      .update(users)
      .set({
        mode,
        availability: nextAvailability,
        updatedAt: new Date(),
      })
      .where(eq(users.uid, uid))
      .returning();

    await logActivity({
      userUid: uid,
      action: 'mode.changed',
      entityType: 'user',
      entityId: uid,
      summary: mode === 'sleep' ? 'Activated Sleep Mode' : 'Switched to Work Mode',
    });

    return updated;
  } catch (error) {
    throw dbError('Unable to update operating mode.', error);
  }
}

export async function listCategories(onlyActive = true) {
  try {
    if (onlyActive) {
      return await db
        .select()
        .from(categories)
        .where(eq(categories.active, true))
        .orderBy(categories.nameEn);
    }
    return await db.select().from(categories).orderBy(categories.nameEn);
  } catch (error) {
    throw dbError('Unable to load categories.', error);
  }
}

export async function createCategory(input: {
  slug: string;
  nameEn: string;
  nameAr: string;
  description?: string;
}) {
  try {
    const [row] = await db
      .insert(categories)
      .values({
        slug: input.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        nameEn: input.nameEn.trim(),
        nameAr: input.nameAr.trim(),
        description: input.description?.trim() ?? '',
        active: true,
      })
      .returning();
    return row;
  } catch (error) {
    throw dbError('Unable to create category.', error);
  }
}

export async function searchProjects(filters: {
  query?: string;
  category?: string;
  skill?: string;
  budgetMin?: number;
  budgetMax?: number;
  projectType?: string;
  experienceLevel?: string;
  remoteOnly?: boolean;
  status?: string;
  clientUid?: string;
  limit?: number;
}) {
  try {
    const conditions = [];
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(projects.status, filters.status));
    } else if (!filters.clientUid) {
      conditions.push(eq(projects.status, 'open'));
    }
    if (filters.category && filters.category !== 'all') {
      conditions.push(eq(projects.category, filters.category));
    }
    if (filters.projectType && filters.projectType !== 'all') {
      conditions.push(eq(projects.projectType, filters.projectType));
    }
    if (filters.experienceLevel && filters.experienceLevel !== 'all') {
      conditions.push(eq(projects.experienceLevel, filters.experienceLevel));
    }
    if (filters.remoteOnly) {
      conditions.push(eq(projects.remote, true));
    }
    if (filters.clientUid) {
      conditions.push(eq(projects.clientUid, filters.clientUid));
    }
    if (filters.query && filters.query.trim()) {
      const pattern = `%${filters.query.trim()}%`;
      conditions.push(or(ilike(projects.title, pattern), ilike(projects.description, pattern)));
    }

    const rows = await db
      .select({
        project: projects,
        clientName: users.fullName,
        clientTitle: users.title,
        clientCountry: users.country,
        clientPhoto: users.photoUrl,
      })
      .from(projects)
      .innerJoin(users, eq(projects.clientUid, users.uid))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(projects.createdAt))
      .limit(filters.limit ?? 50);

    return rows
      .map((r) => ({
        ...r.project,
        client: {
          uid: r.project.clientUid,
          fullName: r.clientName,
          title: r.clientTitle,
          country: r.clientCountry,
          photoUrl: r.clientPhoto,
        },
      }))
      .filter((p) => {
        if (filters.skill && filters.skill.trim()) {
          const needle = filters.skill.trim().toLowerCase();
          const hasSkill = (p.skills ?? []).some((s) => s.toLowerCase().includes(needle));
          if (!hasSkill) return false;
        }
        if (filters.budgetMin !== undefined && p.budgetMin < filters.budgetMin) return false;
        if (filters.budgetMax !== undefined && p.budgetMin > filters.budgetMax) return false;
        return true;
      });
  } catch (error) {
    throw dbError('Unable to query projects.', error);
  }
}

export async function getProjectDetails(projectId: number) {
  try {
    const rows = await db
      .select({
        project: projects,
        clientName: users.fullName,
        clientTitle: users.title,
        clientCountry: users.country,
        clientPhoto: users.photoUrl,
      })
      .from(projects)
      .innerJoin(users, eq(projects.clientUid, users.uid))
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!rows.length) return null;
    const row = rows[0];
    const proposalCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(proposals)
      .where(eq(proposals.projectId, projectId));

    return {
      ...row.project,
      proposalCount: proposalCountRows[0]?.count ?? 0,
      client: {
        uid: row.project.clientUid,
        fullName: row.clientName,
        title: row.clientTitle,
        country: row.clientCountry,
        photoUrl: row.clientPhoto,
      },
    };
  } catch (error) {
    throw dbError('Unable to fetch project details.', error);
  }
}

export async function createProject(
  clientUid: string,
  input: {
    title: string;
    description: string;
    category: string;
    skills: string[];
    budgetType: 'fixed' | 'hourly';
    budgetMin: number;
    budgetMax?: number | null;
    duration: string;
    experienceLevel: string;
    projectType: string;
    remote: boolean;
    requirements?: string;
    deadline?: string | null;
    status?: 'draft' | 'open';
  },
) {
  try {
    const [created] = await db
      .insert(projects)
      .values({
        clientUid,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        skills: input.skills ?? [],
        budgetType: input.budgetType || 'fixed',
        budgetMin: Math.round(input.budgetMin),
        budgetMax: input.budgetMax ? Math.round(input.budgetMax) : null,
        duration: input.duration.trim(),
        experienceLevel: input.experienceLevel || 'mid',
        projectType: input.projectType || 'one-time',
        remote: input.remote ?? true,
        requirements: input.requirements?.trim() ?? '',
        deadline: input.deadline || null,
        status: input.status ?? 'open',
      })
      .returning();

    await logActivity({
      userUid: clientUid,
      action: 'project.created',
      entityType: 'project',
      entityId: String(created.id),
      summary: `Published project "${created.title}"`,
    });

    return created;
  } catch (error) {
    throw dbError('Unable to create project.', error);
  }
}

export async function updateProject(
  projectId: number,
  actorUid: string,
  isAdmin: boolean,
  patch: Partial<{
    title: string;
    description: string;
    category: string;
    skills: string[];
    budgetMin: number;
    budgetMax: number | null;
    duration: string;
    requirements: string;
    deadline: string | null;
    status: string;
  }>,
) {
  try {
    const existing = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!existing.length) throw new Error('Project not found.');
    if (existing[0].clientUid !== actorUid && !isAdmin) {
      throw new Error('Not authorized to modify this project.');
    }

    const [updated] = await db
      .update(projects)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    return updated;
  } catch (error) {
    throw dbError('Unable to update project.', error);
  }
}

export async function searchFreelancers(filters: {
  query?: string;
  skill?: string;
  category?: string;
  availability?: string;
  experienceLevel?: string;
  limit?: number;
}) {
  try {
    const conditions = [
      eq(users.accountType, 'freelancer'),
      eq(users.accountStatus, 'active'),
    ];
    if (filters.availability && filters.availability !== 'all') {
      conditions.push(eq(users.availability, filters.availability));
    }
    if (filters.experienceLevel && filters.experienceLevel !== 'all') {
      conditions.push(eq(users.experienceLevel, filters.experienceLevel));
    }
    if (filters.query && filters.query.trim()) {
      const pattern = `%${filters.query.trim()}%`;
      conditions.push(
        or(
          ilike(users.fullName, pattern),
          ilike(users.title, pattern),
          ilike(users.bio, pattern),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.updatedAt))
      .limit(filters.limit ?? 50);

    return rows
      .filter((u) => {
        const prefs = u.preferences ?? DEFAULT_USER_PREFERENCES;
        if (prefs.profileVisibility === 'private' || prefs.discoverable === false) {
          return false;
        }
        if (filters.skill && filters.skill.trim()) {
          const needle = filters.skill.trim().toLowerCase();
          if (!(u.skills ?? []).some((s) => s.toLowerCase().includes(needle))) return false;
        }
        if (filters.category && filters.category !== 'all') {
          if (!(u.preferredCategories ?? []).includes(filters.category)) return false;
        }
        return true;
      })
      .map((u) => ({
        uid: u.uid,
        fullName: u.fullName,
        photoUrl: u.photoUrl,
        title: u.title,
        bio: u.bio,
        country: u.country,
        availability: u.availability,
        mode: u.mode,
        experienceLevel: u.experienceLevel,
        hourlyRate: u.hourlyRate,
        skills: u.skills,
        preferredCategories: u.preferredCategories,
        portfolio: u.portfolio,
        workHistory: u.workHistory,
        socialLinks: u.socialLinks,
      }));
  } catch (error) {
    throw dbError('Unable to query freelancer directory.', error);
  }
}

export async function submitProposal(
  freelancerUid: string,
  input: {
    projectId: number;
    approach: string;
    estimatedDuration: string;
    proposedBudget: number;
  },
) {
  try {
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!projectRows.length) throw new Error('Project not found.');
    const project = projectRows[0];
    if (project.clientUid === freelancerUid) {
      throw new Error('You cannot submit a proposal to your own project.');
    }
    if (project.status !== 'open') {
      throw new Error('This project is no longer accepting proposals.');
    }

    const [created] = await db
      .insert(proposals)
      .values({
        projectId: input.projectId,
        freelancerUid,
        approach: input.approach.trim(),
        estimatedDuration: input.estimatedDuration.trim(),
        proposedBudget: Math.round(input.proposedBudget),
        status: 'submitted',
      })
      .returning();

    await createNotification({
      userUid: project.clientUid,
      type: 'proposal_received',
      title: 'New proposal received',
      body: `A freelancer submitted a proposal for "${project.title}".`,
      targetPage: 'my-projects',
      targetId: String(project.id),
      essential: false,
    });

    await logActivity({
      userUid: freelancerUid,
      action: 'proposal.submitted',
      entityType: 'proposal',
      entityId: String(created.id),
      summary: `Submitted proposal for "${project.title}"`,
    });

    return created;
  } catch (error) {
    throw dbError(
      error instanceof Error ? error.message : 'Unable to submit proposal.',
      error,
    );
  }
}

export async function listUserProposals(uid: string) {
  try {
    const sent = await db
      .select({
        proposal: proposals,
        projectTitle: projects.title,
        projectCategory: projects.category,
        projectStatus: projects.status,
        clientUid: projects.clientUid,
      })
      .from(proposals)
      .innerJoin(projects, eq(proposals.projectId, projects.id))
      .where(eq(proposals.freelancerUid, uid))
      .orderBy(desc(proposals.createdAt));

    const received = await db
      .select({
        proposal: proposals,
        projectTitle: projects.title,
        freelancerName: users.fullName,
        freelancerTitle: users.title,
        freelancerPhoto: users.photoUrl,
        freelancerSkills: users.skills,
        freelancerPortfolio: users.portfolio,
      })
      .from(proposals)
      .innerJoin(projects, eq(proposals.projectId, projects.id))
      .innerJoin(users, eq(proposals.freelancerUid, users.uid))
      .where(eq(projects.clientUid, uid))
      .orderBy(desc(proposals.createdAt));

    return {
      sent: sent.map((r) => ({
        ...r.proposal,
        projectTitle: r.projectTitle,
        projectCategory: r.projectCategory,
        projectStatus: r.projectStatus,
        clientUid: r.clientUid,
      })),
      received: received.map((r) => ({
        ...r.proposal,
        projectTitle: r.projectTitle,
        freelancer: {
          uid: r.proposal.freelancerUid,
          fullName: r.freelancerName,
          title: r.freelancerTitle,
          photoUrl: r.freelancerPhoto,
          skills: r.freelancerSkills,
          portfolio: r.freelancerPortfolio,
        },
      })),
    };
  } catch (error) {
    throw dbError('Unable to load proposals.', error);
  }
}

export async function updateProposalStatus(
  proposalId: number,
  actorUid: string,
  nextStatus: ProposalStatus,
) {
  try {
    const rows = await db
      .select({
        proposal: proposals,
        project: projects,
      })
      .from(proposals)
      .innerJoin(projects, eq(proposals.projectId, projects.id))
      .where(eq(proposals.id, proposalId))
      .limit(1);

    if (!rows.length) throw new Error('Proposal not found.');
    const { proposal, project } = rows[0];
    const actorRole =
      project.clientUid === actorUid
        ? 'client'
        : proposal.freelancerUid === actorUid
          ? 'freelancer'
          : null;

    if (!actorRole) throw new Error('Not authorized to update this proposal.');
    if (!canTransitionProposal(proposal.status as ProposalStatus, nextStatus, actorRole)) {
      throw new Error(`Cannot change proposal from ${proposal.status} to ${nextStatus}.`);
    }

    const [updated] = await db
      .update(proposals)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(proposals.id, proposalId))
      .returning();

    let createdEngagement = null;
    if (nextStatus === 'accepted') {
      await db
        .update(projects)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      const [eng] = await db
        .insert(engagements)
        .values({
          projectId: project.id,
          proposalId: proposal.id,
          clientUid: project.clientUid,
          freelancerUid: proposal.freelancerUid,
          agreedBudget: proposal.proposedBudget,
          progress: 0,
          status: 'active',
          deadline: project.deadline,
        })
        .returning();

      createdEngagement = eng;

      await db.insert(milestones).values([
        {
          engagementId: eng.id,
          title: 'Kickoff & Architecture Specification',
          description: 'Align deliverables, timelines, and acceptance criteria.',
          amount: Math.round(proposal.proposedBudget * 0.3),
          dueDate: project.deadline,
          status: 'in_progress',
        },
        {
          engagementId: eng.id,
          title: 'Final Delivery & Review',
          description: 'Complete implementation, verification, and handoff.',
          amount: Math.round(proposal.proposedBudget * 0.7),
          dueDate: project.deadline,
          status: 'pending',
        },
      ]);

      await createNotification({
        userUid: proposal.freelancerUid,
        type: 'proposal_accepted',
        title: 'Proposal accepted',
        body: `Your proposal for "${project.title}" was accepted. A project workspace is now active.`,
        targetPage: 'my-projects',
        targetId: String(eng.id),
        essential: true,
      });
    } else if (nextStatus === 'rejected') {
      await createNotification({
        userUid: proposal.freelancerUid,
        type: 'proposal_rejected',
        title: 'Proposal status updated',
        body: `Your proposal for "${project.title}" was not selected.`,
        targetPage: 'my-projects',
        targetId: String(proposal.id),
        essential: false,
      });
    }

    return { proposal: updated, engagement: createdEngagement };
  } catch (error) {
    throw dbError(
      error instanceof Error ? error.message : 'Unable to update proposal status.',
      error,
    );
  }
}

export async function listEngagements(uid: string) {
  try {
    const rows = await db
      .select({
        engagement: engagements,
        projectTitle: projects.title,
        projectCategory: projects.category,
        projectDescription: projects.description,
      })
      .from(engagements)
      .innerJoin(projects, eq(engagements.projectId, projects.id))
      .where(or(eq(engagements.clientUid, uid), eq(engagements.freelancerUid, uid)))
      .orderBy(desc(engagements.createdAt));

    const results = [];
    for (const r of rows) {
      const ms = await db
        .select()
        .from(milestones)
        .where(eq(milestones.engagementId, r.engagement.id))
        .orderBy(milestones.id);
      const counterpartUid =
        r.engagement.clientUid === uid ? r.engagement.freelancerUid : r.engagement.clientUid;
      const counterpart = await getUserByUid(counterpartUid);

      results.push({
        ...r.engagement,
        projectTitle: r.projectTitle,
        projectCategory: r.projectCategory,
        projectDescription: r.projectDescription,
        milestones: ms,
        counterpart: counterpart
          ? {
              uid: counterpart.uid,
              fullName: counterpart.fullName,
              title: counterpart.title,
              photoUrl: counterpart.photoUrl,
            }
          : null,
      });
    }
    return results;
  } catch (error) {
    throw dbError('Unable to load engagements.', error);
  }
}

export async function addMilestone(
  engagementId: number,
  actorUid: string,
  input: { title: string; description?: string; amount?: number; dueDate?: string | null },
) {
  try {
    const engRows = await db
      .select()
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!engRows.length) throw new Error('Engagement not found.');
    const eng = engRows[0];
    if (eng.clientUid !== actorUid && eng.freelancerUid !== actorUid) {
      throw new Error('Not authorized to access this engagement.');
    }

    const [created] = await db
      .insert(milestones)
      .values({
        engagementId,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        amount: Math.max(0, Math.round(input.amount ?? 0)),
        dueDate: input.dueDate || null,
        status: 'pending',
      })
      .returning();

    const allMs = await db.select().from(milestones).where(eq(milestones.engagementId, engagementId));
    await db
      .update(engagements)
      .set({ progress: computeEngagementProgress(allMs), updatedAt: new Date() })
      .where(eq(engagements.id, engagementId));

    return created;
  } catch (error) {
    throw dbError('Unable to add milestone.', error);
  }
}

export async function updateMilestoneStatus(
  milestoneId: number,
  actorUid: string,
  status: 'pending' | 'in_progress' | 'submitted' | 'approved',
) {
  try {
    const msRows = await db
      .select({ milestone: milestones, engagement: engagements })
      .from(milestones)
      .innerJoin(engagements, eq(milestones.engagementId, engagements.id))
      .where(eq(milestones.id, milestoneId))
      .limit(1);
    if (!msRows.length) throw new Error('Milestone not found.');
    const { engagement } = msRows[0];
    if (engagement.clientUid !== actorUid && engagement.freelancerUid !== actorUid) {
      throw new Error('Not authorized.');
    }
    if (status === 'approved' && engagement.clientUid !== actorUid) {
      throw new Error('Only the client can approve a milestone.');
    }

    const [updated] = await db
      .update(milestones)
      .set({ status })
      .where(eq(milestones.id, milestoneId))
      .returning();

    const allMs = await db
      .select()
      .from(milestones)
      .where(eq(milestones.engagementId, engagement.id));
    const progress = computeEngagementProgress(allMs);
    await db
      .update(engagements)
      .set({
        progress,
        status: progress === 100 ? 'completed' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(engagements.id, engagement.id));

    return { milestone: updated, progress };
  } catch (error) {
    throw dbError(
      error instanceof Error ? error.message : 'Unable to update milestone.',
      error,
    );
  }
}

export async function listTasks(uid: string, filters?: { status?: string; projectId?: number }) {
  try {
    const conditions = [or(eq(tasks.ownerUid, uid), eq(tasks.assigneeUid, uid))];
    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(tasks.status, filters.status));
    }
    if (filters?.projectId) {
      conditions.push(eq(tasks.projectId, filters.projectId));
    }
    return await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.updatedAt));
  } catch (error) {
    throw dbError('Unable to fetch tasks.', error);
  }
}

export async function createTask(
  ownerUid: string,
  input: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    projectId?: number | null;
    assigneeUid?: string | null;
  },
) {
  try {
    const [created] = await db
      .insert(tasks)
      .values({
        ownerUid,
        assigneeUid: input.assigneeUid || ownerUid,
        projectId: input.projectId ?? null,
        title: input.title.trim(),
        description: input.description?.trim() ?? '',
        status: input.status || 'todo',
        priority: input.priority || 'medium',
        dueDate: input.dueDate || null,
      })
      .returning();

    await logActivity({
      userUid: ownerUid,
      action: 'task.created',
      entityType: 'task',
      entityId: String(created.id),
      summary: `Created task "${created.title}"`,
    });

    return created;
  } catch (error) {
    throw dbError('Unable to create task.', error);
  }
}

export async function updateTask(
  taskId: number,
  actorUid: string,
  patch: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: string | null;
    projectId: number | null;
  }>,
) {
  try {
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!rows.length) throw new Error('Task not found.');
    if (rows[0].ownerUid !== actorUid && rows[0].assigneeUid !== actorUid) {
      throw new Error('Not authorized to edit this task.');
    }

    const [updated] = await db
      .update(tasks)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return updated;
  } catch (error) {
    throw dbError('Unable to update task.', error);
  }
}

export async function deleteTask(taskId: number, actorUid: string) {
  try {
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!rows.length) throw new Error('Task not found.');
    if (rows[0].ownerUid !== actorUid) {
      throw new Error('Only the task owner can delete this task.');
    }
    await db.delete(tasks).where(eq(tasks.id, taskId));
    return { deleted: true, id: taskId };
  } catch (error) {
    throw dbError('Unable to delete task.', error);
  }
}

export async function getOrCreateConversation(
  userUid: string,
  recipientUid: string,
  projectId?: number | null,
) {
  try {
    if (userUid === recipientUid) {
      throw new Error('Cannot start a direct conversation with yourself.');
    }
    const existing = await db
      .select()
      .from(conversations)
      .where(
        or(
          and(
            eq(conversations.participantAUid, userUid),
            eq(conversations.participantBUid, recipientUid),
          ),
          and(
            eq(conversations.participantAUid, recipientUid),
            eq(conversations.participantBUid, userUid),
          ),
        ),
      )
      .limit(1);

    if (existing.length) return existing[0];

    const [created] = await db
      .insert(conversations)
      .values({
        participantAUid: userUid,
        participantBUid: recipientUid,
        projectId: projectId ?? null,
      })
      .returning();

    return created;
  } catch (error) {
    throw dbError('Unable to initialize conversation.', error);
  }
}

export async function listConversations(uid: string) {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .where(or(eq(conversations.participantAUid, uid), eq(conversations.participantBUid, uid)))
      .orderBy(desc(conversations.lastMessageAt));

    const enriched = [];
    for (const c of rows) {
      const otherUid = c.participantAUid === uid ? c.participantBUid : c.participantAUid;
      const otherUser = await getUserByUid(otherUid);
      const lastMsgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const unreadRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, c.id),
            sql`${messages.senderUid} <> ${uid}`,
            sql`${messages.readAt} IS NULL`,
          ),
        );

      enriched.push({
        ...c,
        participant: otherUser
          ? {
              uid: otherUser.uid,
              fullName: otherUser.fullName,
              title: otherUser.title,
              photoUrl: otherUser.photoUrl,
              availability: otherUser.availability,
            }
          : null,
        lastMessage: lastMsgs[0] ?? null,
        unreadCount: unreadRows[0]?.count ?? 0,
      });
    }
    return enriched;
  } catch (error) {
    throw dbError('Unable to list conversations.', error);
  }
}

export async function listMessages(conversationId: number, uid: string) {
  try {
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!convRows.length) throw new Error('Conversation not found.');
    const conv = convRows[0];
    if (conv.participantAUid !== uid && conv.participantBUid !== uid) {
      throw new Error('Access denied to this conversation.');
    }

    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          sql`${messages.senderUid} <> ${uid}`,
          sql`${messages.readAt} IS NULL`,
        ),
      );

    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  } catch (error) {
    throw dbError('Unable to load messages.', error);
  }
}

export async function sendMessage(params: {
  senderUid: string;
  conversationId?: number;
  recipientUid?: string;
  projectId?: number | null;
  body: string;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
}) {
  try {
    let convId = params.conversationId;
    let recipientUid = params.recipientUid;

    if (!convId) {
      if (!recipientUid) throw new Error('Recipient or conversation ID is required.');
      const conv = await getOrCreateConversation(params.senderUid, recipientUid, params.projectId);
      convId = conv.id;
    } else {
      const convRows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId))
        .limit(1);
      if (!convRows.length) throw new Error('Conversation not found.');
      const conv = convRows[0];
      if (conv.participantAUid !== params.senderUid && conv.participantBUid !== params.senderUid) {
        throw new Error('Not a participant in this conversation.');
      }
      recipientUid =
        conv.participantAUid === params.senderUid ? conv.participantBUid : conv.participantAUid;
    }

    const [created] = await db
      .insert(messages)
      .values({
        conversationId: convId,
        senderUid: params.senderUid,
        body: params.body.trim(),
        attachmentName: params.attachmentName || null,
        attachmentUrl: params.attachmentUrl || null,
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, convId));

    if (recipientUid) {
      await createNotification({
        userUid: recipientUid,
        type: 'new_message',
        title: 'New direct message',
        body: params.body.trim().slice(0, 120),
        targetPage: 'messages',
        targetId: String(convId),
        essential: false,
      });
    }

    return created;
  } catch (error) {
    throw dbError('Unable to send message.', error);
  }
}

export async function createNotification(input: {
  userUid: string;
  type: string;
  title: string;
  body: string;
  targetPage?: string;
  targetId?: string;
  essential?: boolean;
}) {
  try {
    const user = await getUserByUid(input.userUid);
    if (!user) return null;
    const prefs = user.preferences ?? DEFAULT_USER_PREFERENCES;

    const categoryEnabled =
      input.type === 'new_message'
        ? prefs.notifyMessages
        : input.type.startsWith('proposal')
          ? prefs.notifyProposals
          : input.type.startsWith('project')
            ? prefs.notifyProjects
            : input.type === 'deadline'
              ? prefs.notifyDeadlines
              : true;

    const allow = shouldDeliverNotification({
      mode: (user.mode as AppMode) || 'work',
      essential: input.essential ?? false,
      sleepModeMuteNonEssential: prefs.sleepModeMuteNonEssential,
      categoryEnabled,
    });

    if (!allow) return null;

    const [created] = await db
      .insert(notifications)
      .values({
        userUid: input.userUid,
        type: input.type,
        title: input.title,
        body: input.body,
        targetPage: input.targetPage ?? null,
        targetId: input.targetId ?? null,
        essential: input.essential ?? false,
        read: false,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
}

export async function listNotifications(uid: string) {
  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userUid, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  } catch (error) {
    throw dbError('Unable to fetch notifications.', error);
  }
}

export async function markNotificationRead(uid: string, notificationId?: number) {
  try {
    if (notificationId) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userUid, uid)));
    } else {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userUid, uid));
    }
    return { ok: true };
  } catch (error) {
    throw dbError('Unable to update notification status.', error);
  }
}

export async function listSavedItems(uid: string) {
  try {
    const rows = await db
      .select()
      .from(savedItems)
      .where(eq(savedItems.userUid, uid))
      .orderBy(desc(savedItems.createdAt));

    const detailed = [];
    for (const item of rows) {
      if (item.itemType === 'project') {
        const proj = await getProjectDetails(Number(item.itemId));
        detailed.push({ ...item, project: proj });
      } else if (item.itemType === 'freelancer') {
        const user = await getUserByUid(item.itemId);
        detailed.push({
          ...item,
          freelancer: user
            ? {
                uid: user.uid,
                fullName: user.fullName,
                title: user.title,
                photoUrl: user.photoUrl,
                skills: user.skills,
                availability: user.availability,
              }
            : null,
        });
      }
    }
    return detailed;
  } catch (error) {
    throw dbError('Unable to load saved items.', error);
  }
}

export async function toggleSavedItem(
  uid: string,
  itemType: 'project' | 'freelancer',
  itemId: string,
) {
  try {
    const existing = await db
      .select()
      .from(savedItems)
      .where(
        and(
          eq(savedItems.userUid, uid),
          eq(savedItems.itemType, itemType),
          eq(savedItems.itemId, itemId),
        ),
      )
      .limit(1);

    if (existing.length) {
      await db.delete(savedItems).where(eq(savedItems.id, existing[0].id));
      return { saved: false, itemType, itemId };
    }

    const [created] = await db
      .insert(savedItems)
      .values({ userUid: uid, itemType, itemId })
      .returning();
    return { saved: true, item: created };
  } catch (error) {
    throw dbError('Unable to update saved items.', error);
  }
}

export async function getDashboardData(uid: string) {
  try {
    const user = await getUserByUid(uid);
    if (!user) throw new Error('User not found.');

    const [
      userTasks,
      userEngagements,
      userProposals,
      userSaved,
      userConversations,
      openProjects,
      freelancers,
      recentActivity,
    ] = await Promise.all([
      listTasks(uid),
      listEngagements(uid),
      listUserProposals(uid),
      listSavedItems(uid),
      listConversations(uid),
      searchProjects({ status: 'open', limit: 20 }),
      searchFreelancers({ limit: 20 }),
      db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.userUid, uid))
        .orderBy(desc(activityLogs.createdAt))
        .limit(12),
    ]);

    const publishedProjects = await searchProjects({ clientUid: uid, status: 'all', limit: 20 });

    const recommendedProjects =
      user.mode === 'sleep'
        ? []
        : openProjects
            .filter((p) => p.clientUid !== uid)
            .map((p) => ({
              ...p,
              matchScore: computeSkillMatchRatio(user.skills ?? [], p.skills ?? []),
            }))
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 6);

    const recommendedFreelancers =
      user.mode === 'sleep'
        ? []
        : freelancers
            .filter((f) => f.uid !== uid)
            .slice(0, 6);

    const upcomingDeadlines = userTasks
      .filter((t) => t.dueDate && t.status !== 'completed')
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      .slice(0, 6);

    return {
      user,
      stats: {
        activeEngagements: userEngagements.filter((e) => e.status === 'active').length,
        publishedProjects: publishedProjects.length,
        pendingProposals: userProposals.sent.filter(
          (p) => p.status === 'submitted' || p.status === 'under_review',
        ).length,
        receivedProposals: userProposals.received.filter(
          (p) => p.status === 'submitted' || p.status === 'under_review',
        ).length,
        openTasks: userTasks.filter((t) => t.status !== 'completed').length,
        completedTasks: userTasks.filter((t) => t.status === 'completed').length,
        savedItems: userSaved.length,
        unreadMessages: userConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
      },
      activeEngagements: userEngagements.slice(0, 5),
      publishedProjects: publishedProjects.slice(0, 5),
      pendingProposals: userProposals.sent.slice(0, 5),
      receivedProposals: userProposals.received.slice(0, 5),
      tasks: userTasks.slice(0, 8),
      upcomingDeadlines,
      recentMessages: userConversations.slice(0, 5),
      savedItems: userSaved.slice(0, 6),
      recommendedProjects,
      recommendedFreelancers,
      recentActivity,
    };
  } catch (error) {
    throw dbError('Unable to assemble dashboard overview.', error);
  }
}

export async function searchPlatform(query: string, uid?: string) {
  try {
    const q = query.trim();
    if (!q) {
      return { projects: [], freelancers: [], tasks: [], saved: [] };
    }
    const [matchedProjects, matchedFreelancers] = await Promise.all([
      searchProjects({ query: q, status: 'open', limit: 10 }),
      searchFreelancers({ query: q, limit: 10 }),
    ]);

    let matchedTasks: Array<typeof tasks.$inferSelect> = [];
    let matchedSaved: Awaited<ReturnType<typeof listSavedItems>> = [];
    if (uid) {
      const allTasks = await listTasks(uid);
      const lower = q.toLowerCase();
      matchedTasks = allTasks
        .filter(
          (t) =>
            t.title.toLowerCase().includes(lower) ||
            (t.description ?? '').toLowerCase().includes(lower),
        )
        .slice(0, 10);
      const allSaved = await listSavedItems(uid);
      matchedSaved = allSaved.filter((s) => {
        if ('project' in s && s.project) {
          return s.project.title.toLowerCase().includes(lower);
        }
        if ('freelancer' in s && s.freelancer) {
          return s.freelancer.fullName.toLowerCase().includes(lower);
        }
        return false;
      });
    }

    return {
      projects: matchedProjects,
      freelancers: matchedFreelancers,
      tasks: matchedTasks,
      saved: matchedSaved,
    };
  } catch (error) {
    throw dbError('Unable to execute platform search.', error);
  }
}

export async function listWorkspaceNotes(uid: string) {
  try {
    return await db
      .select()
      .from(workspaceNotes)
      .where(eq(workspaceNotes.userUid, uid))
      .orderBy(desc(workspaceNotes.pinned), desc(workspaceNotes.updatedAt));
  } catch (error) {
    throw dbError('Unable to load workspace notes.', error);
  }
}

export async function createWorkspaceNote(
  uid: string,
  input: { title: string; content: string; pinned?: boolean; colorTag?: string },
) {
  try {
    const [created] = await db
      .insert(workspaceNotes)
      .values({
        userUid: uid,
        title: input.title.trim(),
        content: input.content.trim(),
        pinned: input.pinned ?? false,
        colorTag: input.colorTag ?? 'neutral',
      })
      .returning();
    return created;
  } catch (error) {
    throw dbError('Unable to save note.', error);
  }
}

export async function updateWorkspaceNote(
  noteId: number,
  uid: string,
  patch: Partial<{ title: string; content: string; pinned: boolean }>,
) {
  try {
    const [updated] = await db
      .update(workspaceNotes)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(workspaceNotes.id, noteId), eq(workspaceNotes.userUid, uid)))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw dbError('Unable to update note.', error);
  }
}

export async function deleteWorkspaceNote(noteId: number, uid: string) {
  try {
    await db
      .delete(workspaceNotes)
      .where(and(eq(workspaceNotes.id, noteId), eq(workspaceNotes.userUid, uid)));
    return { deleted: true };
  } catch (error) {
    throw dbError('Unable to delete note.', error);
  }
}

export async function createReport(
  reporterUid: string,
  input: { targetType: 'project' | 'user'; targetId: string; reason: string; details?: string },
) {
  try {
    const [created] = await db
      .insert(reports)
      .values({
        reporterUid,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason.trim(),
        details: input.details?.trim() ?? '',
        status: 'open',
      })
      .returning();
    return created;
  } catch (error) {
    throw dbError('Unable to submit report.', error);
  }
}

export async function listAiConversations(uid: string) {
  try {
    return await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userUid, uid))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(40);
  } catch (error) {
    throw dbError('Unable to load Lens AI conversation history.', error);
  }
}

export async function createAiConversation(uid: string, title: string) {
  try {
    const [created] = await db
      .insert(aiConversations)
      .values({
        userUid: uid,
        title: title.trim().slice(0, 100) || 'New Lens Session',
      })
      .returning();
    return created;
  } catch (error) {
    throw dbError('Unable to create Lens AI conversation.', error);
  }
}

export async function renameAiConversation(conversationId: number, uid: string, title: string) {
  try {
    const clean = title.trim().slice(0, 100);
    if (!clean) throw new Error('Conversation title cannot be empty.');
    const [updated] = await db
      .update(aiConversations)
      .set({ title: clean, updatedAt: new Date() })
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userUid, uid)))
      .returning();
    if (!updated) throw new Error('Conversation not found.');
    return updated;
  } catch (error) {
    throw dbError(
      error instanceof Error ? error.message : 'Unable to rename conversation.',
      error,
    );
  }
}

export async function deleteAiConversation(conversationId: number, uid: string) {
  try {
    const existing = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userUid, uid)))
      .limit(1);
    if (!existing.length) throw new Error('Conversation not found.');
    await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
    await db
      .delete(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userUid, uid)));
    return { deleted: true, id: conversationId };
  } catch (error) {
    throw dbError(
      error instanceof Error ? error.message : 'Unable to delete conversation.',
      error,
    );
  }
}

export async function getAiMessages(conversationId: number, uid: string) {
  try {
    const conv = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userUid, uid)))
      .limit(1);
    if (!conv.length) throw new Error('Conversation not found.');
    return await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(aiMessages.createdAt);
  } catch (error) {
    throw dbError('Unable to load Lens AI messages.', error);
  }
}

export async function saveAiMessage(params: {
  conversationId: number;
  role: 'user' | 'model';
  content: string;
  toolCalls?: ToolExecutionTrace[];
}) {
  try {
    const [created] = await db
      .insert(aiMessages)
      .values({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        toolCalls: params.toolCalls ?? [],
      })
      .returning();

    await db
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, params.conversationId));

    return created;
  } catch (error) {
    throw dbError('Unable to store Lens AI message.', error);
  }
}

export async function recordToolExecution(params: {
  userUid: string;
  conversationId?: number | null;
  toolName: string;
  args: Record<string, unknown>;
  status: string;
  resultSummary: string;
}) {
  try {
    await db.insert(aiToolExecutions).values({
      userUid: params.userUid,
      conversationId: params.conversationId ?? null,
      toolName: params.toolName,
      args: params.args,
      status: params.status,
      resultSummary: params.resultSummary,
    });
  } catch (error) {
    console.error('Failed to log AI tool execution:', error);
  }
}

export async function logActivity(params: {
  userUid: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
}) {
  try {
    await db.insert(activityLogs).values({
      userUid: params.userUid,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      summary: params.summary,
    });
  } catch (error) {
    console.error('Failed to record activity log:', error);
  }
}

export async function getAdminOverview() {
  try {
    const [allUsers, allProjects, allReports, allCategories, recentLogs, proposalCount, engagementCount, taskCount] =
      await Promise.all([
        db.select().from(users).orderBy(desc(users.createdAt)).limit(100),
        db.select().from(projects).orderBy(desc(projects.createdAt)).limit(100),
        db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100),
        listCategories(false),
        db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(40),
        db.select({ count: sql<number>`count(*)::int` }).from(proposals),
        db.select({ count: sql<number>`count(*)::int` }).from(engagements),
        db.select({ count: sql<number>`count(*)::int` }).from(tasks),
      ]);

    return {
      analytics: {
        totalUsers: allUsers.length,
        totalProjects: allProjects.length,
        openProjects: allProjects.filter((p) => p.status === 'open').length,
        totalProposals: proposalCount[0]?.count ?? 0,
        totalEngagements: engagementCount[0]?.count ?? 0,
        totalTasks: taskCount[0]?.count ?? 0,
        openReports: allReports.filter((r) => r.status === 'open').length,
      },
      users: allUsers,
      projects: allProjects,
      reports: allReports,
      categories: allCategories,
      activityLogs: recentLogs,
    };
  } catch (error) {
    throw dbError('Unable to load administration overview.', error);
  }
}

export async function adminUpdateUser(
  targetUid: string,
  patch: Partial<{ accountStatus: 'active' | 'suspended'; role: 'user' | 'admin' }>,
) {
  try {
    const [updated] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.uid, targetUid))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw dbError('Unable to update user status.', error);
  }
}

export async function adminUpdateReport(reportId: number, status: string) {
  try {
    const [updated] = await db
      .update(reports)
      .set({ status })
      .where(eq(reports.id, reportId))
      .returning();
    return updated ?? null;
  } catch (error) {
    throw dbError('Unable to update report.', error);
  }
}
