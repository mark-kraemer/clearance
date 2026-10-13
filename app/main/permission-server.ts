// A stdio MCP server that `claude -p --permission-prompt-tool
// mcp__clearance__permission` calls whenever auto mode wants a human: tool
// permissions it will not decide itself, and every AskUserQuestion. It
// forwards each request to the Clearance app over localhost and returns the
// decision the user made there. It holds no credentials and never talks to
// Anthropic; it only sits between the CLI and the app.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const url = process.env.CLEARANCE_PERMISSION_URL;
const runId = process.env.CLEARANCE_RUN || '';
if (!url) {
  process.stderr.write('CLEARANCE_PERMISSION_URL is not set\n');
  process.exit(2);
}

const server = new McpServer({ name: 'clearance', version: '0.1.0' });

server.registerTool(
  'permission',
  {
    description: 'Asks the Clearance app to decide a permission request or answer a question.',
    inputSchema: {
      tool_name: z.string(),
      input: z.record(z.unknown()).optional(),
      tool_use_id: z.string().optional(),
    },
  },
  async ({ tool_name, input, tool_use_id }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run: runId, tool_name, input: input ?? {}, tool_use_id: tool_use_id ?? null }),
    });
    const decision = res.ok ? await res.text() : JSON.stringify({ behavior: 'deny', message: `Clearance returned ${res.status}` });
    return { content: [{ type: 'text', text: decision }] };
  },
);

await server.connect(new StdioServerTransport());
