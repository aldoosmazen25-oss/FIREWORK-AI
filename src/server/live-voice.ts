import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { LiveServerMessage, Modality } from '@google/genai';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getUserByUid } from '../db/queries.ts';
import { createGeminiClient } from './lens-agent.ts';

export function attachLiveVoiceServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/live' });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<ReturnType<typeof createGeminiClient>['live']['connect']>> | null =
      null;
    let isClosed = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          token?: string;
          language?: string;
          audio?: string;
          text?: string;
        };

        if (msg.type === 'init') {
          if (!msg.token) {
            sendJson({ type: 'error', message: 'Sign in with Google to start a Lens AI voice session.' });
            return;
          }
          let uid: string;
          try {
            const decoded = await adminAuth.verifyIdToken(msg.token);
            uid = decoded.uid;
          } catch {
            sendJson({ type: 'error', message: 'Authentication session expired. Sign in again.' });
            return;
          }

          if (!process.env.GEMINI_API_KEY) {
            sendJson({ type: 'error', message: 'Gemini API key is not configured on the server.' });
            return;
          }

          const profile = await getUserByUid(uid);
          const ai = createGeminiClient();

          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: [
                'You are Lens AI, the voice intelligence of Firework AI.',
                `Respond naturally and concisely in ${msg.language === 'ar' ? 'Arabic' : 'English'}.`,
                profile
                  ? `You are speaking with ${profile.fullName}, account type: ${profile.accountType}, currently in ${profile.mode} mode.`
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
            },
            callbacks: {
              onopen: () => {
                if (!isClosed) sendJson({ type: 'ready' });
              },
              onmessage: (message: LiveServerMessage) => {
                if (isClosed) return;
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendJson({ type: 'input_transcript', text: content.inputTranscription.text });
                }
                if (content?.outputTranscription?.text) {
                  sendJson({ type: 'output_transcript', text: content.outputTranscription.text });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson({ type: 'audio', data: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  sendJson({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  sendJson({ type: 'turn_complete' });
                }
              },
              onerror: (err: unknown) => {
                console.error('Gemini Live API error:', err);
                sendJson({ type: 'error', message: 'Voice connection interrupted. Please reconnect.' });
              },
              onclose: () => {
                sendJson({ type: 'closed' });
              },
            },
          });
          return;
        }

        if (msg.type === 'audio' && msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (msg.type === 'text' && msg.text && liveSession) {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch (error) {
        console.error('Live voice WebSocket handler error:', error);
        sendJson({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unable to process voice stream.',
        });
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      liveSession = null;
    });
  });

  return wss;
}
