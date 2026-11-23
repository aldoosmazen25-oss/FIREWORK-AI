export type AccountType = 'freelancer' | 'client';
export type AppMode = 'work' | 'sleep';
export type AvailabilityStatus = 'available' | 'busy' | 'offline';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed';
export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'closed';

export interface ProjectValidationInput {
  title?: string;
  description?: string;
  category?: string;
  budgetMin?: number | string;
  budgetMax?: number | string | null;
  duration?: string;
  skills?: string[];
}

export interface ProposalValidationInput {
  projectId?: number | string;
  approach?: string;
  estimatedDuration?: string;
  proposedBudget?: number | string;
}

export interface TaskValidationInput {
  title?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateProjectInput(input: ProjectValidationInput): ValidationResult {
  const errors: Record<string, string> = {};
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const category = (input.category ?? '').trim();
  const duration = (input.duration ?? '').trim();
  const budgetMin = Number(input.budgetMin);
  const budgetMax =
    input.budgetMax !== undefined && input.budgetMax !== null && input.budgetMax !== ''
      ? Number(input.budgetMax)
      : null;

  if (title.length < 4) {
    errors.title = 'Project title must be at least 4 characters.';
  } else if (title.length > 140) {
    errors.title = 'Project title cannot exceed 140 characters.';
  }

  if (description.length < 20) {
    errors.description = 'Provide a clear project description of at least 20 characters.';
  }

  if (!category) {
    errors.category = 'Select a project category.';
  }

  if (!Number.isFinite(budgetMin) || budgetMin <= 0) {
    errors.budgetMin = 'Minimum budget must be a positive number.';
  }

  if (budgetMax !== null && (!Number.isFinite(budgetMax) || budgetMax < budgetMin)) {
    errors.budgetMax = 'Maximum budget must be greater than or equal to minimum budget.';
  }

  if (!duration) {
    errors.duration = 'Specify an expected project duration.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateProposalInput(input: ProposalValidationInput): ValidationResult {
  const errors: Record<string, string> = {};
  const projectId = Number(input.projectId);
  const approach = (input.approach ?? '').trim();
  const estimatedDuration = (input.estimatedDuration ?? '').trim();
  const proposedBudget = Number(input.proposedBudget);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    errors.projectId = 'A valid project is required.';
  }

  if (approach.length < 20) {
    errors.approach = 'Describe your approach in at least 20 characters.';
  }

  if (!estimatedDuration) {
    errors.estimatedDuration = 'Provide an estimated duration.';
  }

  if (!Number.isFinite(proposedBudget) || proposedBudget <= 0) {
    errors.proposedBudget = 'Proposed budget must be greater than zero.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateTaskInput(input: TaskValidationInput): ValidationResult {
  const errors: Record<string, string> = {};
  const title = (input.title ?? '').trim();
  const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'review', 'completed'];
  const validPriorities = ['low', 'medium', 'high'];

  if (title.length < 2) {
    errors.title = 'Task title must be at least 2 characters.';
  } else if (title.length > 160) {
    errors.title = 'Task title cannot exceed 160 characters.';
  }

  if (input.status && !validStatuses.includes(input.status as TaskStatus)) {
    errors.status = 'Invalid task status.';
  }

  if (input.priority && !validPriorities.includes(input.priority)) {
    errors.priority = 'Invalid task priority.';
  }

  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    errors.dueDate = 'Due date must follow YYYY-MM-DD format.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function resolveAvailabilityForMode(
  mode: AppMode,
  previousAvailability: AvailabilityStatus = 'available',
): AvailabilityStatus {
  if (mode === 'sleep') {
    return 'offline';
  }
  return previousAvailability === 'offline' ? 'available' : previousAvailability;
}

export function shouldDeliverNotification(params: {
  mode: AppMode;
  essential: boolean;
  sleepModeMuteNonEssential: boolean;
  categoryEnabled: boolean;
}): boolean {
  if (params.essential) {
    return true;
  }
  if (!params.categoryEnabled) {
    return false;
  }
  if (params.mode === 'sleep' && params.sleepModeMuteNonEssential) {
    return false;
  }
  return true;
}

export function computeSkillMatchRatio(userSkills: string[], requiredSkills: string[]): number {
  if (!requiredSkills.length || !userSkills.length) return 0;
  const normalizedUser = new Set(userSkills.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const normalizedReq = requiredSkills.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!normalizedReq.length) return 0;
  let hits = 0;
  for (const skill of normalizedReq) {
    if (normalizedUser.has(skill)) hits += 1;
  }
  return Math.round((hits / normalizedReq.length) * 100);
}

export function computeEngagementProgress(
  milestonesList: Array<{ status: string }>,
): number {
  if (!milestonesList.length) return 0;
  const approved = milestonesList.filter((m) => m.status === 'approved').length;
  return Math.round((approved / milestonesList.length) * 100);
}

export function canTransitionProposal(
  currentStatus: ProposalStatus,
  nextStatus: ProposalStatus,
  actorRole: 'client' | 'freelancer',
): boolean {
  if (actorRole === 'freelancer') {
    return (
      nextStatus === 'withdrawn' &&
      (currentStatus === 'submitted' || currentStatus === 'under_review' || currentStatus === 'draft')
    );
  }
  if (actorRole === 'client') {
    if (currentStatus === 'withdrawn' || currentStatus === 'accepted' || currentStatus === 'rejected') {
      return false;
    }
    return nextStatus === 'under_review' || nextStatus === 'accepted' || nextStatus === 'rejected';
  }
  return false;
}

export function sanitizeCsvSkills(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item.length <= 40),
    ),
  ).slice(0, 20);
}

export function formatBudget(
  budgetType: string,
  budgetMin: number,
  budgetMax?: number | null,
): string {
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  const suffix = budgetType === 'hourly' ? '/hr' : '';
  if (budgetMax && budgetMax > budgetMin) {
    return `${fmt.format(budgetMin)} - ${fmt.format(budgetMax)}${suffix}`;
  }
  return `${fmt.format(budgetMin)}${suffix}`;
}
