# Apache Unomi MCP Server

A Model Context Protocol server for Apache Unomi

This is a TypeScript-based MCP server that provides access to Apache Unomi profile data. It implements core MCP concepts by providing:

- Resources representing Unomi profiles with URIs and metadata
- Tools for retrieving and searching profiles
- Full integration with Apache Unomi's REST API

## Features

### Resources
- List and access profiles via `unomi://profiles/list` URI
- Each profile includes properties, segments, scores, and consents
- JSON format for structured data access

### Tools
- `get_profile` - Retrieve a specific profile by ID
  - Takes profileId as required parameter
  - Returns full profile data from Unomi
- `search_profiles` - Search for profiles
  - Takes query string and optional limit/offset parameters
  - Searches across firstName, lastName, and email fields

## Configuration

The server requires the following environment variables:

```bash
UNOMI_BASE_URL=http://your-unomi-server:8181
UNOMI_USERNAME=your-username
UNOMI_PASSWORD=your-password
```

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config and environment variables:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unomi-server": {
      "command": "/path/to/unomi-server/build/index.js",
      "env": {
        "UNOMI_BASE_URL": "http://your-unomi-server:8181",
        "UNOMI_USERNAME": "your-username",
        "UNOMI_PASSWORD": "your-password"
      }
    }
  }
}
```

The `env` section in the configuration allows you to set the required environment variables for the server. Replace the values with your actual Unomi server details.

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

You can also tail the Claude Desktop logs to see MCP requests and responses:

```bash
# Follow logs in real-time
tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
```
