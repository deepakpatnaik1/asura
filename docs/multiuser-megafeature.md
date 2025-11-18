# Multiuser Megafeature

## Goal

Production-ready multiuser authentication and authorization for 999 users.

## Implementation Plan

### 1. Supabase Auth Integration
- Enable Google OAuth provider in Supabase dashboard
- Add auth UI components (login, logout, profile)
- Handle OAuth callback flow
- Store user sessions (httpOnly cookies)

### 2. Database Schema Migration
- Add `user_id UUID REFERENCES auth.users(id)` to all tables
- Backfill existing data with single admin user
- Create indexes on user_id columns

### 3. Row-Level Security (RLS) Policies
- Enable RLS on all tables (superjournal, journal, files, file_chunks, user_settings, models)
- Write SELECT/INSERT/UPDATE/DELETE policies scoped to `auth.uid()`
- Test user isolation (user A cannot access user B's data)

### 4. API Security Hardening
- Validate auth tokens in all API endpoints
- Replace anon key with service role key server-side only
- Add rate limiting per user (prevent abuse)
- Input validation and sanitization

### 5. Secrets Management
- Move service role key to server-only environment
- Audit .env exposure (never send to client)
- Rotate API keys if compromised

### 6. Testing & Validation
- Create test users (Google accounts or email/password)
- Verify data isolation between users
- Test edge cases (logged out, expired tokens, concurrent sessions)
- Load test with 50-100 concurrent users

### 7. Deployment Preparation
- Production environment variables
- Database backups and disaster recovery plan
- Monitoring and error tracking (Sentry optional)
- User documentation (login flow, privacy policy)
