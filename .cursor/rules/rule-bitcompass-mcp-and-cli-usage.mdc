# BitCompass MCP and CLI Usage

This project uses BitCompass for managing rules, solutions, and activity logs. LLMs should use the available MCP tools and CLI commands when appropriate.

## MCP Tools (Available in AI Editor)

Use these tools directly from the AI editor when available:

### search-rules
Search BitCompass rules by query.

**When to use:** When you need to find existing rules or patterns that might help solve a problem.

**Parameters:**
- `query` (required): Search query string
- `kind` (optional): Filter by 'rule' or 'solution'
- `limit` (optional): Maximum number of results (default: 20)

**Example:** Search for rules about "authentication" or "error handling"

### search-solutions
Search BitCompass solutions by query.

**When to use:** When you need to find solutions to specific problems.

**Parameters:**
- `query` (required): Search query string
- `limit` (optional): Maximum number of results (default: 20)

**Example:** Search for solutions about "database connection issues"

### post-rules
Publish a new rule or solution to BitCompass.

**When to use:** When you've created a reusable pattern, best practice, or solution that should be shared with the team.

**Parameters:**
- `kind` (required): 'rule' or 'solution'
- `title` (required): Title of the rule/solution
- `body` (required): Full content of the rule/solution
- `description` (optional): Short description
- `context` (optional): Additional context
- `examples` (optional): Array of example strings
- `technologies` (optional): Array of technology tags

**Example:** After implementing a new pattern, publish it as a rule so others can reuse it.

### create-activity-log
Collect repository summary and git activity, then push to activity logs.

**When to use:** When the user asks to log their work or track activity for a specific time period.

**Parameters:**
- `time_frame` (required): 'day', 'week', or 'month'
- `repo_path` (optional): Path to git repo (defaults to current directory)

**Example:** User asks "log my work for this week" → call with time_frame: 'week'

## CLI Commands (Run via Terminal)

Use these commands when you need to interact with BitCompass from the terminal:

### Authentication
- `bitcompass login` - Log in with Google (opens browser)
- `bitcompass logout` - Remove stored credentials
- `bitcompass whoami` - Show current user (email)

**When to use:** When authentication is required or to verify login status.

### Project Configuration
- `bitcompass init` - Configure project: editor/AI provider and output folder

**When to use:** Run once per project to set up BitCompass configuration.

### Rules Management
- `bitcompass rules search [query]` - Search rules interactively
- `bitcompass rules list` - List all available rules
- `bitcompass rules pull [id]` - Pull a rule by ID (saves to project rules folder)
  - Use `--global` flag to install globally to ~/.cursor/rules/
- `bitcompass rules push [file]` - Push a rule file to BitCompass

**When to use:** 
- `pull`: When you want to download and use a specific rule in your project
- `push`: When you've created a rule file and want to share it
- `search`/`list`: When browsing available rules

### Solutions Management
- `bitcompass solutions search [query]` - Search solutions interactively
- `bitcompass solutions pull [id]` - Pull a solution by ID
  - Use `--global` flag to install globally
- `bitcompass solutions push [file]` - Push a solution file to BitCompass

**When to use:** Similar to rules, but for problem-solution pairs.

### Activity Logs
- `bitcompass log` - Collect repo summary and git activity, push to activity logs
- `bitcompass log YYYY-MM-DD` - Log activity for a specific date
- `bitcompass log YYYY-MM-DD YYYY-MM-DD` - Log activity for a date range

**When to use:** When the user wants to track or log their development activity.

### Configuration
- `bitcompass config list` - List all config values
- `bitcompass config get <key>` - Get a specific config value
- `bitcompass config set <key> <value>` - Set config value (supabaseUrl, supabaseAnonKey, apiUrl)

**When to use:** When you need to check or modify BitCompass configuration.

### MCP Server
- `bitcompass mcp start` - Start MCP server (stdio mode for AI editors)
- `bitcompass mcp status` - Show MCP server status

**When to use:** Usually configured automatically by the AI editor. Use `status` to verify MCP is working.

## Decision Guide

**Use MCP tools when:**
- You're working in the AI editor and need to search or publish rules/solutions
- The user asks you to search for existing patterns or solutions
- You've created something reusable and want to share it immediately
- The user wants to log their activity

**Use CLI commands when:**
- You need to authenticate or verify authentication
- The user explicitly asks to run a CLI command
- You need to pull rules/solutions to the project (for version control)
- You need to check or modify configuration
- The MCP tool is not available or returns an authentication error

## Authentication Notes

- Most MCP tools require authentication (except search-rules and search-solutions)
- If you get an authentication error, instruct the user to run `bitcompass login` and restart the MCP server
- CLI commands that require auth will prompt the user to login

## Best Practices

1. **Search before creating:** Before publishing a new rule, search to see if something similar exists
2. **Use descriptive titles:** When posting rules/solutions, use clear, searchable titles
3. **Include context:** Add context, examples, and technologies when posting to make rules more discoverable
4. **Pull for version control:** Use `rules pull` or `solutions pull` to add rules to your project's rules folder (tracked in git)
5. **Global vs project:** Use `--global` flag when you want a rule available across all projects, otherwise use project-specific rules
