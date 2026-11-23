import http from 'http';
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { requireAuth, optionalAuth, type AuthRequest } from './src/middleware/auth.ts';
import * as queries from './src/db/queries.ts';
import { db } from './src/db/index.ts';
import { categories } from './src/db/schema.ts';
import { executeLensTool, runLensAgentTurn } from './src/server/lens-agent.ts';
import { attachLiveVoiceServer } from './src/server/live-voice.ts';
import {
  validateProjectInput,
  validateProposalInput,
  validateTaskInput,
  type AppMode,
  type ProposalStatus,
} from './src/utils/domain.ts';

dotenv.config();

const DEFAULT_CATEGORIES = [
  {
    slug: 'software-engineering',
    nameEn: 'Software Engineering',
    nameAr: 'هندسة البرمجيات',
    description: 'Full-stack web, mobile, backend APIs, and cloud systems',
  },
  {
    slug: 'product-design',
    nameEn: 'Product & UI/UX Design',
    nameAr: 'تصميم المنتجات وواجهات المستخدم',
    description: 'Interface architecture, design systems, and prototyping',
  },
  {
    slug: 'ai-data',
    nameEn: 'AI & Data Systems',
    nameAr: 'الذكاء الاصطناعي والبيانات',
    description: 'Machine learning, LLM orchestration, and analytics pipelines',
  },
  {
    slug: 'brand-visual',
    nameEn: 'Brand & Visual Identity',
    nameAr: 'الهوية البصرية والعلامات التجارية',
    description: 'Visual systems, typography, editorial, and motion design',
  },
  {
    slug: 'business-strategy',
    nameEn: 'Operations & Strategy',
    nameAr: 'العمليات والاستراتيجية',
    description: 'Product management, business operations, and advisory',
  },
  {
    slug: 'writing-localization',
    nameEn: 'Technical Writing & Localization',
    nameAr: 'الكتابة التقنية والتعريب',
    description: 'Documentation, bilingual Arabic/English copy, and research',
  },
];

let categoriesBootstrapped = false;
async function ensureCategoriesExist() {
  if (categoriesBootstrapped) return;
  try {
    const existing = await queries.listCategories(false);
    if (existing.length === 0) {
      await db.insert(categories).values(DEFAULT_CATEGORIES).onConflictDoNothing();
    }
    categoriesBootstrapped = true;
  } catch (error) {
    console.error('Deferred category seed check failed:', error);
  }
}

// Simple in-memory rate limiter for AI and mutation endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.path}:${(req as AuthRequest).user?.uid || req.ip || 'anon'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }
    bucket.count += 1;
    return next();
  };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '2mb' }));

  // Attach Gemini 3.8 Live WebSocket voice bridge
  attachLiveVoiceServer(server);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'firework-ai' });
  });

  // Categories (public read, lazy default categories bootstrap)
  app.get('/api/categories', async (_req, res) => {
    try {
      await ensureCategoriesExist();
      const rows = await queries.listCategories(true);
      res.json({ categories: rows });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load categories.' });
    }
  });

  // Auth sync & current user profile
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tokenUser = req.user!;
      const body = req.body ?? {};
      const user = await queries.getOrCreateUser({
        uid: tokenUser.uid,
        email: tokenUser.email || body.email || '',
        fullName: body.fullName || tokenUser.name || tokenUser.email?.split('@')[0] || 'Member',
        photoUrl: tokenUser.picture || body.photoUrl || null,
      });
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to synchronize account.' });
    }
  });

  app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await queries.getOrCreateUser({
        uid: req.user!.uid,
        email: req.user!.email || '',
        fullName: req.user!.name,
        photoUrl: req.user!.picture || null,
      });
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load profile.' });
    }
  });

  app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await queries.updateUserProfile(req.user!.uid, req.body ?? {});
      res.json({ user: updated });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update profile.' });
    }
  });

  // Work Mode / Sleep Mode
  app.put('/api/mode', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mode = req.body?.mode as AppMode;
      if (mode !== 'work' && mode !== 'sleep') {
        return res.status(400).json({ error: 'Mode must be "work" or "sleep".' });
      }
      const user = await queries.setUserMode(req.user!.uid, mode);
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to change mode.' });
    }
  });

  // Dashboard
  app.get('/api/dashboard', requireAuth, async (req: AuthRequest, res) => {
    try {
      await queries.getOrCreateUser({
        uid: req.user!.uid,
        email: req.user!.email || '',
        fullName: req.user!.name,
        photoUrl: req.user!.picture || null,
      });
      const data = await queries.getDashboardData(req.user!.uid);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load dashboard.' });
    }
  });

  // Projects marketplace
  app.get('/api/projects', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const q = req.query;
      const list = await queries.searchProjects({
        query: typeof q.q === 'string' ? q.q : undefined,
        category: typeof q.category === 'string' ? q.category : undefined,
        skill: typeof q.skill === 'string' ? q.skill : undefined,
        budgetMin: q.budgetMin ? Number(q.budgetMin) : undefined,
        budgetMax: q.budgetMax ? Number(q.budgetMax) : undefined,
        projectType: typeof q.projectType === 'string' ? q.projectType : undefined,
        experienceLevel: typeof q.experienceLevel === 'string' ? q.experienceLevel : undefined,
        remoteOnly: q.remote === 'true',
        status: typeof q.status === 'string' ? q.status : 'open',
        clientUid: q.mine === 'true' && req.user ? req.user.uid : undefined,
      });
      res.json({ projects: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch projects.' });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await queries.getProjectDetails(Number(req.params.id));
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      res.json({ project });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load project.' });
    }
  });

  app.post('/api/projects', requireAuth, async (req: AuthRequest, res) => {
    try {
      const validation = validateProjectInput(req.body ?? {});
      if (!validation.valid) {
        return res.status(400).json({ error: 'Validation failed.', errors: validation.errors });
      }
      const created = await queries.createProject(req.user!.uid, req.body);
      res.status(201).json({ project: created });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to publish project.' });
    }
  });

  app.patch('/api/projects/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const me = await queries.getUserByUid(req.user!.uid);
      const updated = await queries.updateProject(
        Number(req.params.id),
        req.user!.uid,
        me?.role === 'admin',
        req.body ?? {},
      );
      res.json({ project: updated });
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : 'Failed to update project.' });
    }
  });

  // Freelancer Directory
  app.get('/api/freelancers', async (req, res) => {
    try {
      const q = req.query;
      const list = await queries.searchFreelancers({
        query: typeof q.q === 'string' ? q.q : undefined,
        skill: typeof q.skill === 'string' ? q.skill : undefined,
        category: typeof q.category === 'string' ? q.category : undefined,
        availability: typeof q.availability === 'string' ? q.availability : undefined,
        experienceLevel: typeof q.experienceLevel === 'string' ? q.experienceLevel : undefined,
      });
      res.json({ freelancers: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to search freelancers.' });
    }
  });

  // Proposals
  app.get('/api/proposals', requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = await queries.listUserProposals(req.user!.uid);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load proposals.' });
    }
  });

  app.post('/api/proposals', requireAuth, async (req: AuthRequest, res) => {
    try {
      const validation = validateProposalInput(req.body ?? {});
      if (!validation.valid) {
        return res.status(400).json({ error: 'Validation failed.', errors: validation.errors });
      }
      const created = await queries.submitProposal(req.user!.uid, {
        projectId: Number(req.body.projectId),
        approach: String(req.body.approach),
        estimatedDuration: String(req.body.estimatedDuration),
        proposedBudget: Number(req.body.proposedBudget),
      });
      res.status(201).json({ proposal: created });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to submit proposal.' });
    }
  });

  app.patch('/api/proposals/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const status = req.body?.status as ProposalStatus;
      const result = await queries.updateProposalStatus(Number(req.params.id), req.user!.uid, status);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update proposal.' });
    }
  });

  // Engagements & Milestones
  app.get('/api/engagements', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listEngagements(req.user!.uid);
      res.json({ engagements: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load engagements.' });
    }
  });

  app.post('/api/engagements/:id/milestones', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.body?.title?.trim()) {
        return res.status(400).json({ error: 'Milestone title is required.' });
      }
      const created = await queries.addMilestone(Number(req.params.id), req.user!.uid, req.body);
      res.status(201).json({ milestone: created });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add milestone.' });
    }
  });

  app.patch('/api/milestones/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await queries.updateMilestoneStatus(
        Number(req.params.id),
        req.user!.uid,
        req.body?.status,
      );
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update milestone.' });
    }
  });

  // Tasks
  app.get('/api/tasks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listTasks(req.user!.uid, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
      });
      res.json({ tasks: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load tasks.' });
    }
  });

  app.post('/api/tasks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const validation = validateTaskInput(req.body ?? {});
      if (!validation.valid) {
        return res.status(400).json({ error: 'Validation failed.', errors: validation.errors });
      }
      const created = await queries.createTask(req.user!.uid, req.body);
      res.status(201).json({ task: created });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create task.' });
    }
  });

  app.patch('/api/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await queries.updateTask(Number(req.params.id), req.user!.uid, req.body ?? {});
      res.json({ task: updated });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update task.' });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await queries.deleteTask(Number(req.params.id), req.user!.uid);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to delete task.' });
    }
  });

  // Messaging
  app.get('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listConversations(req.user!.uid);
      res.json({ conversations: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load conversations.' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listMessages(Number(req.params.id), req.user!.uid);
      res.json({ messages: list });
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : 'Failed to load messages.' });
    }
  });

  app.post('/api/messages', requireAuth, rateLimit(40, 60_000), async (req: AuthRequest, res) => {
    try {
      const body = String(req.body?.body ?? '').trim();
      if (!body) return res.status(400).json({ error: 'Message content cannot be empty.' });
      const created = await queries.sendMessage({
        senderUid: req.user!.uid,
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : undefined,
        recipientUid: req.body?.recipientUid,
        projectId: req.body?.projectId ? Number(req.body.projectId) : null,
        body,
        attachmentName: req.body?.attachmentName || null,
        attachmentUrl: req.body?.attachmentUrl || null,
      });
      res.status(201).json({ message: created });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to send message.' });
    }
  });

  // Notifications
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listNotifications(req.user!.uid);
      res.json({ notifications: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch notifications.' });
    }
  });

  app.post('/api/notifications/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      await queries.markNotificationRead(
        req.user!.uid,
        req.body?.notificationId ? Number(req.body.notificationId) : undefined,
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update notifications.' });
    }
  });

  // Saved Items
  app.get('/api/saved', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listSavedItems(req.user!.uid);
      res.json({ items: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch saved items.' });
    }
  });

  app.post('/api/saved/toggle', requireAuth, async (req: AuthRequest, res) => {
    try {
      const itemType = req.body?.itemType;
      const itemId = String(req.body?.itemId ?? '');
      if ((itemType !== 'project' && itemType !== 'freelancer') || !itemId) {
        return res.status(400).json({ error: 'Valid itemType and itemId are required.' });
      }
      const result = await queries.toggleSavedItem(req.user!.uid, itemType, itemId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save item.' });
    }
  });

  // Global Platform Search
  app.get('/api/search', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const results = await queries.searchPlatform(q, req.user?.uid);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Search failed.' });
    }
  });

  // Workspace Notes (persistent PostgreSQL companion to Google Workspace Hub)
  app.get('/api/notes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const notes = await queries.listWorkspaceNotes(req.user!.uid);
      res.json({ notes });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load notes.' });
    }
  });

  app.post('/api/notes', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.body?.title?.trim() || !req.body?.content?.trim()) {
        return res.status(400).json({ error: 'Note title and content are required.' });
      }
      const note = await queries.createWorkspaceNote(req.user!.uid, req.body);
      res.status(201).json({ note });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create note.' });
    }
  });

  app.patch('/api/notes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const note = await queries.updateWorkspaceNote(Number(req.params.id), req.user!.uid, req.body ?? {});
      res.json({ note });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update note.' });
    }
  });

  app.delete('/api/notes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await queries.deleteWorkspaceNote(Number(req.params.id), req.user!.uid);
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete note.' });
    }
  });

  // Reports
  app.post('/api/reports', requireAuth, rateLimit(10, 60_000), async (req: AuthRequest, res) => {
    try {
      if (!req.body?.targetType || !req.body?.targetId || !req.body?.reason?.trim()) {
        return res.status(400).json({ error: 'Report target and reason are required.' });
      }
      const report = await queries.createReport(req.user!.uid, req.body);
      res.status(201).json({ report });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to submit report.' });
    }
  });

  // Lens AI Agent Routes
  app.get('/api/lens/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.listAiConversations(req.user!.uid);
      res.json({ conversations: list });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load conversations.' });
    }
  });

  app.get('/api/lens/conversations/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await queries.getAiMessages(Number(req.params.id), req.user!.uid);
      res.json({ messages: list });
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : 'Failed to load messages.' });
    }
  });

  app.post('/api/lens/chat', requireAuth, rateLimit(25, 60_000), async (req: AuthRequest, res) => {
    try {
      const message = String(req.body?.message ?? '').trim();
      if (!message) {
        return res.status(400).json({ error: 'Message cannot be empty.' });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          error: 'Gemini API key is not configured. Configure GEMINI_API_KEY in Settings > Secrets.',
        });
      }
      const result = await runLensAgentTurn({
        uid: req.user!.uid,
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : undefined,
        message,
        language: req.body?.language === 'ar' ? 'ar' : 'en',
        currentPage: typeof req.body?.currentPage === 'string' ? req.body.currentPage : 'home',
      });
      res.json(result);
    } catch (error) {
      console.error('Lens AI error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Lens AI encountered an error.',
      });
    }
  });

  app.post('/api/lens/confirm-tool', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { conversationId, toolName, args } = req.body ?? {};
      if (!toolName || !conversationId) {
        return res.status(400).json({ error: 'toolName and conversationId are required.' });
      }
      const clientActions: Parameters<typeof executeLensTool>[4] = [];
      const pending: Parameters<typeof executeLensTool>[5] = [];
      const { trace, result } = await executeLensTool(
        req.user!.uid,
        Number(conversationId),
        String(toolName),
        { ...(args ?? {}), confirmed: true },
        clientActions,
        pending,
      );
      const saved = await queries.saveAiMessage({
        conversationId: Number(conversationId),
        role: 'model',
        content:
          trace.status === 'success'
            ? `Confirmed and executed: ${trace.summary}.`
            : `Execution failed: ${trace.summary}`,
        toolCalls: [trace],
      });
      res.json({ trace, result, clientActions, message: saved });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tool confirmation failed.' });
    }
  });

  // Protected Administration Routes
  const requireAdmin = async (
    req: AuthRequest,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const me = await queries.getUserByUid(req.user!.uid);
      if (!me || me.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator access required.' });
      }
      return next();
    } catch {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
  };

  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const overview = await queries.getAdminOverview();
      res.json(overview);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load admin data.' });
    }
  });

  app.patch('/api/admin/users/:uid', requireAuth, requireAdmin, async (req, res) => {
    try {
      const updated = await queries.adminUpdateUser(String(req.params.uid), req.body ?? {});
      res.json({ user: updated });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update user.' });
    }
  });

  app.patch('/api/admin/reports/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const updated = await queries.adminUpdateReport(Number(req.params.id), String(req.body?.status ?? 'reviewed'));
      res.json({ report: updated });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update report.' });
    }
  });

  app.post('/api/admin/categories', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!req.body?.slug || !req.body?.nameEn || !req.body?.nameAr) {
        return res.status(400).json({ error: 'Slug, English name, and Arabic name are required.' });
      }
      const created = await queries.createCategory(req.body);
      res.status(201).json({ category: created });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add category.' });
    }
  });

  // Frontend Vite middleware in dev, static dist in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Firework AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
