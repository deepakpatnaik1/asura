# Asura

A sophisticated web application built with SvelteKit, Supabase, and Tailwind CSS.

## Tech Stack

- **Frontend**: SvelteKit + TypeScript
- **Styling**: Tailwind CSS (with Typography & Forms plugins)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **AI Services**:
  - Fireworks AI
  - Voyage AI

## Project Structure

```
asura/
├── src/                    # SvelteKit application
│   ├── lib/               # Shared libraries and utilities
│   │   └── supabase.ts    # Supabase client
│   ├── routes/            # SvelteKit routes
│   └── app.css            # Global styles with Tailwind
├── supabase/              # Supabase configuration
│   ├── functions/         # Edge Functions
│   │   └── _shared/       # Shared utilities for functions
│   ├── migrations/        # Database migrations
│   └── config.toml        # Supabase config
└── static/                # Static assets
```

## Getting Started

### Prerequisites

- Node.js 22+ (use nvm: `nvm use 22`)
- Supabase CLI (optional, for local development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/deepakpatnaik1/asura.git
cd asura
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and configure your environment variables:
```bash
cp .env.example .env
```

### Development

Start the development server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building

Create a production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Supabase Setup

### Local Development

Start Supabase locally:
```bash
supabase start
```

### Edge Functions

Create a new edge function:
```bash
supabase functions new function-name
```

Deploy an edge function:
```bash
supabase functions deploy function-name
```

## Environment Variables

See `.env.example` for required environment variables:

- `PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (safe for client-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `FIREWORKS_API_KEY` - Fireworks AI API key
- `VOYAGE_API_KEY` - Voyage AI API key

## License

Private project - All rights reserved
