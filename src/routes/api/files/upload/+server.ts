import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { processFile } from '$lib/file-processor';

// Maximum file size: 10MB
const MAX_FILE_SIZE_MB = 10;

export const POST: RequestHandler = async ({ request }) => {
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

    // 2. PARSE FORM DATA
    let file: File;
    try {
      const formData = await request.formData();
      const uploadedFile = formData.get('file');

      if (!uploadedFile || !(uploadedFile instanceof File)) {
        return json(
          {
            error: {
              message: 'No file provided in request',
              code: 'NO_FILE'
            }
          },
          { status: 400 }
        );
      }

      file = uploadedFile;
    } catch (parseError) {
      return json(
        {
          error: {
            message: 'Failed to parse multipart form data',
            code: 'FORM_PARSE_ERROR',
            details: parseError instanceof Error ? parseError.message : 'Unknown error'
          }
        },
        { status: 400 }
      );
    }

    // 3. VALIDATE FILE
    const filename = file.name;
    const size = file.size;
    const contentType = file.type;

    if (!filename || filename.trim().length === 0) {
      return json(
        {
          error: {
            message: 'File must have a non-empty filename',
            code: 'INVALID_FILENAME'
          }
        },
        { status: 400 }
      );
    }

    // Check file size (basic check; processFile() will also validate)
    const fileSizeMb = size / (1024 * 1024);
    if (fileSizeMb > MAX_FILE_SIZE_MB) {
      return json(
        {
          error: {
            message: `File size (${fileSizeMb.toFixed(2)}MB) exceeds maximum of ${MAX_FILE_SIZE_MB}MB`,
            code: 'FILE_TOO_LARGE'
          }
        },
        { status: 413 }
      );
    }

    // 4. CONVERT FILE TO BUFFER
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch (bufferError) {
      return json(
        {
          error: {
            message: 'Failed to read file content',
            code: 'FILE_READ_ERROR',
            details: bufferError instanceof Error ? bufferError.message : 'Unknown error'
          }
        },
        { status: 400 }
      );
    }

    // 5. PROCESS FILE (async in background)
    // Fire-and-forget: Don't await, return immediately to client
    processFile(
      {
        fileBuffer,
        filename,
        userId,
        contentType
      },
      { skipDuplicateCheck: false } // Check for duplicates
    ).catch(error => {
      // Log but don't throw - processing failures are captured in DB
      console.error('[Upload API] Background processing error:', error);
    });

    // 6. RETURN SUCCESS WITH FILE ID
    // Note: File will be in "pending" status initially
    // Processing stage updates will be available via Chunk 7 (SSE)
    return json(
      {
        success: true,
        data: {
          id: 'pending-id-placeholder', // Will be set by processFile()
          filename,
          fileSize: size,
          status: 'pending',
          message: 'File upload started. Processing in background.'
        }
      },
      { status: 202 } // 202 Accepted - processing started
    );

  } catch (error) {
    console.error('[Upload API] Unexpected error:', error);
    return json(
      {
        error: {
          message: 'Unexpected error during file upload',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
};
