# Model Context Protocol (MCP) Setup

Asura is configured with two MCP servers for enhanced AI-assisted development:

## 1. Supabase MCP Server

Enables AI assistants to interact with your Supabase database, auth, and storage.

### Configuration

**Package**: `@supabase/mcp-server-supabase`
**Project Ref**: `hsxjcowijclwdxcmhbhs`

### Capabilities

- **Database Operations**: Query tables, insert/update/delete records
- **Schema Inspection**: View table structures, relationships, and indexes
- **Auth Management**: Manage users and authentication
- **Storage Operations**: Handle file uploads and downloads
- **RLS Policies**: View and understand Row Level Security policies

### Usage

```bash
npm run mcp:supabase
```

Or via MCP client (Claude Desktop, Cursor, etc.):
```json
{
  "command": "npx",
  "args": [
    "-y",
    "@supabase/mcp-server-supabase@latest",
    "--project-ref",
    "hsxjcowijclwdxcmhbhs"
  ],
  "env": {
    "SUPABASE_ACCESS_TOKEN": "${SUPABASE_SERVICE_ROLE_KEY}"
  }
}
```

### Environment Variables

- `SUPABASE_SERVICE_ROLE_KEY`: Required for authentication

## 2. Playwright MCP Server

Provides browser automation capabilities for testing, scraping, and interaction.

### Configuration

**Package**: `@playwright/mcp`

### Capabilities

- **Navigation**: Visit URLs, navigate forward/back
- **Interaction**: Click, type, fill forms, hover
- **Extraction**: Get page content, text, attributes
- **Screenshots**: Capture full page or element screenshots
- **JavaScript Execution**: Run custom JS in browser context
- **Testing**: Generate and run automated tests
- **Console Logs**: Capture browser console output
- **Network Monitoring**: Track HTTP requests/responses

### Usage

```bash
npm run mcp:playwright
```

Or via MCP client:
```json
{
  "command": "npx",
  "args": [
    "-y",
    "@playwright/mcp@latest"
  ]
}
```

### Testing Commands

Run end-to-end tests:
```bash
npm run test:e2e
```

Run tests with UI:
```bash
npm run test:e2e:ui
```

## MCP Configuration File

The project includes a `mcp.json` file that can be used with MCP-compatible AI assistants:

```json
{
  "mcpServers": {
    "supabase": { ... },
    "playwright": { ... }
  }
}
```

## Supported AI Assistants (2025)

Both MCP servers work with:

- ✅ **Claude Desktop** (Code & Chat)
- ✅ **Cursor IDE**
- ✅ **GitHub Copilot** (VS Code)
- ✅ **Windsurf**
- ✅ **Cline**
- ✅ **Warp Terminal**

## Getting Started

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   - Copy `.env.example` to `.env`
   - Add your `SUPABASE_SERVICE_ROLE_KEY`

3. **Install Playwright browsers** (already done):
   ```bash
   npx playwright install
   ```

4. **Configure your AI assistant**:
   - Point it to the `mcp.json` file
   - Or add the server configs to your assistant's settings

## Example Use Cases

### Supabase MCP
- "Show me all tables in the database"
- "Insert a new user with email user@example.com"
- "What are the RLS policies on the posts table?"
- "Query all users created in the last 7 days"

### Playwright MCP
- "Navigate to our app and take a screenshot"
- "Fill out the login form and click submit"
- "Extract all the text from the homepage"
- "Generate a test that checks the signup flow"
- "Monitor network requests on the dashboard page"

## Security Notes

- ⚠️ **Supabase MCP is for development/testing only**
- 🔒 Never commit `.env` files with real credentials
- 🔐 Use service role key only in secure environments
- 🛡️ MCP servers run locally and don't send data to third parties

## Troubleshooting

### Supabase MCP Issues

1. **Authentication Failed**
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
   - Check project ref matches your Supabase project

2. **Connection Issues**
   - Ensure you're connected to the internet
   - Verify your Supabase project is active

### Playwright MCP Issues

1. **Browsers Not Found**
   - Run: `npx playwright install`

2. **Tests Failing**
   - Ensure dev server is running: `npm run dev`
   - Check baseURL in `playwright.config.ts`

## Resources

- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)
- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
