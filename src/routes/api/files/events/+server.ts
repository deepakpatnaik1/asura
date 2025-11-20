import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { TIMING } from '$lib/config/timing';

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
    user_id: string;
  };
}

interface SSEEvent {
  eventType: 'file-update' | 'file-deleted' | 'message-deleted' | 'heartbeat';
  timestamp: string;
  file?: {
    id: string;
    filename?: string;
    file_type?: string;
    status?: 'pending' | 'processing' | 'ready' | 'failed';
    progress?: number;
    processing_stage?: string | null;
    error_message?: string | null;
    user_id?: string;
  };
  message?: {
    id: string;
  };
}

// ==========================================
// GLOBAL STATE (Module-level, shared across all SSE connections)
// ==========================================

// Global Realtime subscriptions (one per server process)
let globalFilesSubscription: any = null;
let globalSuperjournalSubscription: any = null;
let isSubscriptionActive = false;

// Track all active SSE client connections with their userId
const activeConnections = new Map<ReadableStreamDefaultController, string>();

// Supabase admin client (reused across connections)
let supabaseAdmin: any = null;

// Cleanup timer (debounced to avoid rapid subscribe/unsubscribe)
let cleanupTimer: NodeJS.Timeout | null = null;

// ==========================================
// INITIALIZATION FUNCTION
// ==========================================

/**
 * Initialize the global Realtime subscription (called by first connection)
 * This creates ONE subscription shared by all SSE clients
 */
async function initializeGlobalSubscription() {
  // Guard: Don't create duplicate subscriptions
  if (isSubscriptionActive) {
    console.log('[SSE Global] Subscription already active, skipping initialization');
    return;
  }

  console.log('[SSE Global] Initializing global Realtime subscription');

  // Create admin client if needed (reused across all connections)
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('[SSE Global] Created Supabase admin client with SERVICE_ROLE key');
  }

  // Subscribe to ALL changes on files table
  // This ONE subscription will receive events and broadcast to all clients
  globalFilesSubscription = supabaseAdmin
    .channel('files-global')
    .on('postgres_changes', {
      event: '*',  // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'files'
    }, handleFilesEvent)
    .subscribe((status: string) => {
      console.log('[SSE Global Files] Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('[SSE Global Files] Files subscription is now active');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.error('[SSE Global Files] Subscription error, status:', status);
      }
    });

  // Subscribe to DELETE events on superjournal table (for message deletions)
  globalSuperjournalSubscription = supabaseAdmin
    .channel('superjournal-global')
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'superjournal'
    }, handleSuperjournalEvent)
    .subscribe((status: string) => {
      console.log('[SSE Global Superjournal] Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        isSubscriptionActive = true;
        console.log('[SSE Global Superjournal] Superjournal subscription is now active');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.error('[SSE Global Superjournal] Subscription error, status:', status);
      }
    });
}

// ==========================================
// BROADCAST HANDLER
// ==========================================

/**
 * Handle Files table Realtime events and broadcast to ALL active SSE clients
 */
function handleFilesEvent(payload: any) {
  console.log('[SSE Global Files] Realtime event received:', payload.eventType, payload.new?.id || payload.old?.id || '(no id)');
  const event = transformFilesPayload(payload);
  broadcastEvent(event);
}

/**
 * Handle Superjournal table DELETE events and broadcast to ALL active SSE clients
 */
function handleSuperjournalEvent(payload: any) {
  console.log('[SSE Global Superjournal] DELETE event received:', payload.old?.id || '(no id)');
  const event: SSEEvent = {
    eventType: 'message-deleted',
    timestamp: new Date().toISOString(),
    message: { id: payload.old.id }
  };
  broadcastEvent(event);
}

/**
 * Broadcast an SSE event to connections belonging to the event's user
 */
function broadcastEvent(event: SSEEvent) {
  const encoder = new TextEncoder();
  const data = JSON.stringify(event);
  const message = `data: ${data}\n\n`;
  const encoded = encoder.encode(message);

  // Extract user_id from the event payload (available in file events)
  const eventUserId = event.file?.user_id;

  const deadConnections: ReadableStreamDefaultController[] = [];
  let successCount = 0;
  let filteredCount = 0;

  for (const [controller, connectionUserId] of activeConnections.entries()) {
    // Filter: only send to connections matching the event's userId
    if (eventUserId && connectionUserId !== eventUserId) {
      filteredCount++;
      continue;
    }

    try {
      controller.enqueue(encoded);
      successCount++;
    } catch (error) {
      console.warn('[SSE Global] Dead connection detected, marking for removal');
      deadConnections.push(controller);
    }
  }

  console.log(`[SSE Global] Broadcasted to ${successCount} clients, filtered ${filteredCount}, ${deadConnections.length} dead connections`);
  deadConnections.forEach(conn => activeConnections.delete(conn));
}

/**
 * Transform Files table Supabase Realtime payload to SSE event format
 */
function transformFilesPayload(payload: any): SSEEvent {
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    return {
      eventType: 'file-update',
      timestamp: new Date().toISOString(),
      file: {
        id: payload.new.id,
        filename: payload.new.filename,
        file_type: payload.new.file_type,
        status: payload.new.status,
        progress: payload.new.progress,
        processing_stage: payload.new.processing_stage,
        error_message: payload.new.error_message,
        user_id: payload.new.user_id
      }
    };
  } else if (payload.eventType === 'DELETE') {
    return {
      eventType: 'file-deleted',
      timestamp: new Date().toISOString(),
      file: {
        id: payload.old.id,
        user_id: payload.old.user_id
      }
    };
  }

  // Fallback (should not happen)
  console.warn('[SSE Global] Unknown event type:', payload.eventType);
  return {
    eventType: 'heartbeat',
    timestamp: new Date().toISOString()
  };
}

// ==========================================
// CLEANUP FUNCTIONS
// ==========================================

/**
 * Schedule cleanup of global subscription (debounced)
 * Called when a client disconnects - waits 5s before cleanup
 */
function scheduleCleanup() {
  // Cancel any existing cleanup timer
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
  }

  // Schedule cleanup if no connections remain
  cleanupTimer = setTimeout(() => {
    if (activeConnections.size === 0) {
      console.log('[SSE Global] No active connections, cleaning up subscriptions');

      if (globalFilesSubscription) {
        globalFilesSubscription.unsubscribe();
        globalFilesSubscription = null;
      }

      if (globalSuperjournalSubscription) {
        globalSuperjournalSubscription.unsubscribe();
        globalSuperjournalSubscription = null;
      }

      isSubscriptionActive = false;
      supabaseAdmin = null;
      console.log('[SSE Global] Cleanup complete');
    }
  }, TIMING.cleanupDelay);
}

/**
 * Cancel scheduled cleanup
 * Called when a new client connects within the cleanup window
 */
function cancelCleanup() {
  if (cleanupTimer) {
    console.log('[SSE Global] Canceling scheduled cleanup');
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
  try {
    // 1. AUTHENTICATION CHECK
    const { user } = await safeGetSession();
    if (!user) {
      return new Response('event: error\ndata: {"error": "Unauthorized - must be logged in"}\n\n', {
        status: 401,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }
    const userId = user.id;

    // Variables shared between start() and cancel() callbacks
    let heartbeatInterval: NodeJS.Timeout | null = null;

    // 2. CREATE READABLE STREAM FOR SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Add this connection to the global map with userId
        activeConnections.set(controller, userId);
        console.log(`[SSE] Client connected (userId: ${userId}), total connections:`, activeConnections.size);

        // Cancel any pending cleanup (in case of reconnection within 5s window)
        cancelCleanup();

        // Initialize global subscription if not already active
        if (!isSubscriptionActive) {
          await initializeGlobalSubscription();
        }

        // Send initial heartbeat
        const heartbeat = encoder.encode(`data: ${JSON.stringify({
          eventType: 'heartbeat',
          timestamp: new Date().toISOString()
        })}\n\n`);

        try {
          controller.enqueue(heartbeat);
          console.log('[SSE] Initial heartbeat sent');
        } catch (error) {
          console.error('[SSE] Failed to send initial heartbeat:', error);
        }

        // Set up heartbeat interval
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(heartbeat);
          } catch (error) {
            console.warn('[SSE] Heartbeat failed, connection likely dead');
            clearInterval(heartbeatInterval!);
            heartbeatInterval = null;
          }
        }, TIMING.heartbeatInterval);
      },

      cancel(controller) {
        // Called when client disconnects (browser closes connection, network loss, etc.)
        console.log('[SSE] Client disconnected');

        // Remove this connection from the global set
        activeConnections.delete(controller);
        console.log('[SSE] Remaining connections:', activeConnections.size);

        // Clear heartbeat interval
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        // Schedule cleanup if this was the last connection
        if (activeConnections.size === 0) {
          scheduleCleanup();
        }
      }
    });

    // 3. RETURN RESPONSE WITH PROPER SSE HEADERS
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
