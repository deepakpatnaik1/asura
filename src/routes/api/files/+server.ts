import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // NOTE: RLS currently DISABLED (migration 20251108000003)
    // This user_id check will enforce isolation once RLS is enabled in Chunk 2
    const userId = null; // TODO: Extract from session after Chunk 1 complete

    // 2. PARSE QUERY PARAMETERS
    const statusFilter = url.searchParams.get('status');

    // Validate status filter if provided
    const validStatuses = ['pending', 'processing', 'ready', 'failed'];
    if (statusFilter && !validStatuses.includes(statusFilter)) {
      return json(
        {
          error: {
            message: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`,
            code: 'INVALID_STATUS_FILTER'
          }
        },
        { status: 400 }
      );
    }

    // 3. QUERY DATABASE
    let query = supabase
      .from('files')
      .select('id, filename, file_type, status, progress, processing_stage, error_message, uploaded_at, updated_at');

    // Handle null/undefined userId properly (PostgreSQL requires IS NULL, not = 'null')
    if (userId === null || userId === undefined) {
      query = query.is('user_id', null);
    } else {
      query = query.eq('user_id', userId);
    }

    query = query.order('uploaded_at', { ascending: false });

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: files, error } = await query;

    if (error) {
      console.error('[List API] Database query error:', error);
      return json(
        {
          error: {
            message: 'Failed to retrieve file list',
            code: 'DATABASE_ERROR',
            details: error.message
          }
        },
        { status: 500 }
      );
    }

    // 4. RETURN SUCCESS
    return json({
      success: true,
      data: {
        files: files || [],
        count: (files || []).length
      }
    });

  } catch (error) {
    console.error('[List API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error while listing files',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};
