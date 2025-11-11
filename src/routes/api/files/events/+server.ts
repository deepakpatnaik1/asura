import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

// Types for Supabase Realtime payload
interface FilesTablePayload {
  new?: {
    id: string;
    filename: string;
    file_type: string;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    progress: number;
    processing_stage: 'extraction' | 'compression' | 'embedding' | 'finalization' | null;
    error_message: string | null;
    user_id: string;
    updated_at: string;
  };
  old?: {
    id: string;
  };
}

interface SSEEvent {
  eventType: 'file-update' | 'file-deleted' | 'heartbeat';
  timestamp: string;
  file?: {
    id: string;
    filename?: string;
    file_type?: string;
    status?: 'pending' | 'processing' | 'ready' | 'failed';
    progress?: number;
    processing_stage?: string | null;
    error_message?: string | null;
  };
}

export const GET: RequestHandler = async ({ request }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Extract from request headers after Chunk 11 (Google Auth)
    const userId = null;

    if (!userId) {
      return new Response(
        'data: {"error":"Authentication required","code":"AUTH_REQUIRED"}\n\n',
        {
          status: 401,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        }
      );
    }

    // 2. CREATE READABLE STREAM FOR SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let isClosed = false;

        // Helper: Send SSE event
        const sendEvent = (event: SSEEvent) => {
          if (isClosed) return;

          const data = JSON.stringify(event);
          const message = `data: ${data}\n\n`;

          try {
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            console.error('[SSE] Failed to enqueue event:', error);
            isClosed = true;
            controller.close();
          }
        };

        // Helper: Send heartbeat
        const sendHeartbeat = () => {
          sendEvent({
            eventType: 'heartbeat',
            timestamp: new Date().toISOString()
          });
        };

        try {
          // 3. SET UP SUPABASE REALTIME SUBSCRIPTION
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const subscription = (supabase as any)
            .channel(`files-${userId}`)
            .on(
              'postgres_changes',
              {
                event: '*',  // Listen to INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'files',
                filter: `user_id=eq.${userId}`
              },
              (payload: { eventType: string; new?: FilesTablePayload['new']; old?: FilesTablePayload['old'] }) => {
                if (isClosed) return;

                // Handle different event types
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  if (payload.new) {
                    sendEvent({
                      eventType: 'file-update',
                      timestamp: new Date().toISOString(),
                      file: {
                        id: payload.new.id,
                        filename: payload.new.filename,
                        file_type: payload.new.file_type,
                        status: payload.new.status,
                        progress: payload.new.progress,
                        processing_stage: payload.new.processing_stage,
                        error_message: payload.new.error_message
                      }
                    });
                  }
                } else if (payload.eventType === 'DELETE') {
                  if (payload.old) {
                    sendEvent({
                      eventType: 'file-deleted',
                      timestamp: new Date().toISOString(),
                      file: {
                        id: payload.old.id
                      }
                    });
                  }
                }
              }
            )
            .subscribe();

          // 4. SET UP HEARTBEAT (every 30 seconds)
          heartbeatInterval = setInterval(sendHeartbeat, 30000);

          // 5. HANDLE STREAM CLOSURE
          // Note: ReadableStream controller is cancelled when client disconnects
          // We don't have direct access to the close event, but we can handle errors
          const originalClose = controller.close.bind(controller);
          controller.close = () => {
            isClosed = true;
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
            }
            subscription.unsubscribe();
            originalClose();
          };

        } catch (error) {
          console.error('[SSE] Subscription setup error:', error);
          isClosed = true;

          // Send error event before closing
          sendEvent({
            eventType: 'heartbeat',  // Fallback event type
            timestamp: new Date().toISOString()
          });

          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }

          controller.close();
        }
      },

      cancel() {
        // Called when client disconnects (browser closes connection, network loss, etc.)
        console.log(`[SSE] Stream cancelled for user: ${userId}`);
      }
    });

    // 6. RETURN RESPONSE WITH PROPER SSE HEADERS
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('[SSE] Unexpected error:', error);

    // Return error response (not SSE format since stream creation failed)
    return new Response(
      JSON.stringify({
        error: 'Failed to establish SSE connection',
        code: 'SSE_SETUP_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
};
