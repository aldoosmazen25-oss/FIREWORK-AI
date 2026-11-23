import { getWorkspaceAccessToken } from './firebase';

function requireWorkspaceToken(): string {
  const token = getWorkspaceAccessToken();
  if (!token) {
    throw new Error('Google Workspace access token is unavailable. Sign in with Google to authorize.');
  }
  return token;
}

async function googleFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = requireWorkspaceToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google API request failed (${res.status})`);
  }
  return data as T;
}

// 1. GMAIL
export interface GmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export async function listRecentEmails(maxResults = 10): Promise<GmailSummary[]> {
  const list = await googleFetch<{ messages?: Array<{ id: string }> }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
  );
  const ids = list.messages ?? [];
  const details = await Promise.all(
    ids.slice(0, maxResults).map(async (m) => {
      const msg = await googleFetch<{
        id: string;
        snippet?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      );
      const getHeader = (name: string) =>
        msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return {
        id: msg.id,
        subject: getHeader('Subject') || '(No subject)',
        from: getHeader('From') || 'Unknown sender',
        date: getHeader('Date') || '',
        snippet: msg.snippet || '',
      };
    }),
  );
  return details;
}

export async function sendGmailMessage(to: string, subject: string, body: string) {
  const rawMime = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', body].join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(rawMime)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return googleFetch<{ id: string }>('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: encoded }),
  });
}

// 2. GOOGLE DOCS
export async function createGoogleDoc(title: string, initialContent: string) {
  const doc = await googleFetch<{ documentId: string; title: string }>(
    'https://docs.googleapis.com/v1/documents',
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    },
  );
  if (initialContent.trim()) {
    await googleFetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(doc.documentId)}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: initialContent,
              },
            },
          ],
        }),
      },
    );
  }
  return {
    documentId: doc.documentId,
    title: doc.title,
    url: `https://docs.google.com/document/d/${encodeURIComponent(doc.documentId)}/edit`,
  };
}

export async function readGoogleDoc(documentId: string) {
  const safeId = encodeURIComponent(documentId.trim());
  const doc = await googleFetch<{
    documentId: string;
    title: string;
    body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> };
  }>(`https://docs.googleapis.com/v1/documents/${safeId}`);

  const text = (doc.body?.content ?? [])
    .map((block) =>
      (block.paragraph?.elements ?? [])
        .map((el) => el.textRun?.content ?? '')
        .join(''),
    )
    .join('');

  return {
    documentId: doc.documentId,
    title: doc.title,
    text,
    url: `https://docs.google.com/document/d/${safeId}/edit`,
  };
}

// 3. GOOGLE TASKS
export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
}

export async function listGoogleTasks(): Promise<GoogleTaskItem[]> {
  const data = await googleFetch<{ items?: GoogleTaskItem[] }>(
    'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&maxResults=25',
  );
  return data.items ?? [];
}

export async function createGoogleTask(title: string, notes?: string, due?: string) {
  const payload: Record<string, string> = { title };
  if (notes?.trim()) payload.notes = notes.trim();
  if (due?.trim()) payload.due = new Date(`${due}T09:00:00Z`).toISOString();
  return googleFetch<GoogleTaskItem>('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteGoogleTask(taskId: string) {
  const token = requireWorkspaceToken();
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to delete Google Task (${res.status})`);
  }
}

// 4. GOOGLE FORMS
export async function createGoogleForm(title: string, questionPrompt: string) {
  const form = await googleFetch<{ formId: string; responderUri?: string; info?: { title?: string } }>(
    'https://forms.googleapis.com/v1/forms',
    {
      method: 'POST',
      body: JSON.stringify({ info: { title } }),
    },
  );
  if (questionPrompt.trim()) {
    await googleFetch(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(form.formId)}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              createItem: {
                item: {
                  title: questionPrompt.trim(),
                  questionItem: {
                    question: {
                      required: true,
                      textQuestion: { paragraph: true },
                    },
                  },
                },
                location: { index: 0 },
              },
            },
          ],
        }),
      },
    );
  }
  return {
    formId: form.formId,
    title: form.info?.title || title,
    responderUri: form.responderUri || `https://docs.google.com/forms/d/${encodeURIComponent(form.formId)}/edit`,
  };
}

export async function getGoogleFormResponses(formId: string) {
  const safeId = encodeURIComponent(formId.trim());
  return googleFetch<{ responses?: Array<{ responseId: string; createTime?: string; answers?: Record<string, unknown> }> }>(
    `https://forms.googleapis.com/v1/forms/${safeId}/responses`,
  );
}

// 5. GOOGLE MEET
export async function createGoogleMeetSpace() {
  return googleFetch<{ name: string; meetingUri: string; meetingCode: string }>(
    'https://meet.googleapis.com/v2/spaces',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}
