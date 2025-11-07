# Supabase Edge Functions

This directory contains Supabase Edge Functions for the Asura application.

## Structure

- `_shared/` - Shared utilities and helpers
- Each function has its own directory with an `index.ts` file

## Development

To create a new function:
```bash
supabase functions new function-name
```

To serve functions locally:
```bash
supabase functions serve
```

To deploy a function:
```bash
supabase functions deploy function-name
```
