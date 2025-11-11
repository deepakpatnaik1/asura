import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

// Helper function to validate UUID format
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// GET: Retrieve file details
export const GET: RequestHandler = async ({ params }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Replace with actual auth extraction after Chunk 11
    const userId = null;

    if (!userId) {
      return json(
        {
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        },
        { status: 401 }
      );
    }

    // 2. VALIDATE FILE ID
    const { id } = params;
    if (!isValidUUID(id)) {
      return json(
        {
          error: {
            message: 'Invalid file ID format',
            code: 'INVALID_FILE_ID'
          }
        },
        { status: 400 }
      );
    }

    // 3. QUERY DATABASE
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      // Supabase returns specific error when row not found
      if (error.code === 'PGRST116') {
        return json(
          {
            error: {
              message: 'File not found',
              code: 'FILE_NOT_FOUND'
            }
          },
          { status: 404 }
        );
      }

      console.error('[Get File API] Database query error:', error);
      return json(
        {
          error: {
            message: 'Failed to retrieve file details',
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
      data: file
    });

  } catch (error) {
    console.error('[Get File API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error while retrieving file',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};

// DELETE: Delete a file
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    // 1. AUTHENTICATION CHECK
    // TODO: Replace with actual auth extraction after Chunk 11
    const userId = null;

    if (!userId) {
      return json(
        {
          error: {
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          }
        },
        { status: 401 }
      );
    }

    // 2. VALIDATE FILE ID
    const { id } = params;
    if (!isValidUUID(id)) {
      return json(
        {
          error: {
            message: 'Invalid file ID format',
            code: 'INVALID_FILE_ID'
          }
        },
        { status: 400 }
      );
    }

    // 3. VERIFY OWNERSHIP (security check before delete)
    // Query to ensure file belongs to user
    const { data: file, error: queryError } = await supabase
      .from('files')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (queryError) {
      // File not found or doesn't belong to user
      if (queryError.code === 'PGRST116') {
        return json(
          {
            error: {
              message: 'File not found',
              code: 'FILE_NOT_FOUND'
            }
          },
          { status: 404 }
        );
      }

      console.error('[Delete File API] Ownership check error:', queryError);
      return json(
        {
          error: {
            message: 'Failed to verify file ownership',
            code: 'DATABASE_ERROR',
            details: queryError.message
          }
        },
        { status: 500 }
      );
    }

    // 4. DELETE FILE
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[Delete File API] Delete error:', deleteError);
      return json(
        {
          error: {
            message: 'Failed to delete file',
            code: 'DELETE_ERROR',
            details: deleteError.message
          }
        },
        { status: 500 }
      );
    }

    // 5. RETURN SUCCESS
    return json({
      success: true,
      data: {
        message: 'File deleted successfully',
        id
      }
    });

  } catch (error) {
    console.error('[Delete File API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error while deleting file',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};
