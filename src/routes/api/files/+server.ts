import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
  try {
    // 1. AUTHENTICATION CHECK
    const { user } = await safeGetSession();
    if (!user) {
      return json(
        {
          error: {
            message: 'Unauthorized - must be logged in',
            code: 'UNAUTHORIZED'
          }
        },
        { status: 401 }
      );
    }
    const userId = user.id;

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
      .select('id, filename, file_type, status, progress, processing_stage, error_message, uploaded_at, updated_at')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

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
