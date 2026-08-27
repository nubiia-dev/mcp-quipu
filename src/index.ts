#!/usr/bin/env node

import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { QuipuClient } from './quipu-client.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { getContactTools } from './tools/contacts.js';
import { getInvoiceTools } from './tools/invoices.js';
import { getAdditionalIncomeTools } from './tools/additional-incomes.js';
import { getTaxSummaryTools } from './tools/tax-summary.js';

// La versión se lee de package.json en tiempo de ejecución: escrita a mano
// aquí se queda desfasada en cuanto semantic-release publica una versión, y el
// cliente MCP acaba viendo un número que no corresponde al paquete instalado.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const client = new QuipuClient({
  clientId: process.env.QUIPU_CLIENT_ID ?? '',
  clientSecret: process.env.QUIPU_CLIENT_SECRET ?? '',
  ownerSlug: process.env.QUIPU_OWNER_SLUG,
});

const rateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  toolLimits: {
    // Writes are capped tighter than reads: an invoice created by mistake is
    // a legal document in Spain, not just a row in a database.
    create_invoice: { maxRequests: 20, windowMs: 60000 },
    update_invoice: { maxRequests: 30, windowMs: 60000 },
    delete_invoice: { maxRequests: 10, windowMs: 60000 },
    create_contact: { maxRequests: 20, windowMs: 60000 },
    update_contact: { maxRequests: 30, windowMs: 60000 },
    delete_contact: { maxRequests: 10, windowMs: 60000 },
    list_invoices: { maxRequests: 200, windowMs: 60000 },
    list_contacts: { maxRequests: 200, windowMs: 60000 },
    create_additional_income: { maxRequests: 20, windowMs: 60000 },
    update_additional_income: { maxRequests: 30, windowMs: 60000 },
    delete_additional_income: { maxRequests: 10, windowMs: 60000 },
    list_additional_incomes: { maxRequests: 200, windowMs: 60000 },
    // Walks every page of two collections, so it is far heavier than one call.
    get_tax_summary: { maxRequests: 20, windowMs: 60000 },
  },
});

const allTools = {
  ...getContactTools(client),
  ...getInvoiceTools(client),
  ...getAdditionalIncomeTools(client),
  ...getTaxSummaryTools(client),
};

type ToolDefinition = {
  description: string;
  inputSchema: Record<string, unknown>;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  handler: (args: never) => Promise<unknown>;
};

const server = new Server(
  {
    name: 'mcp-quipu',
    version,
  },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(allTools).map(([name, tool]) => {
    const definition = tool as unknown as ToolDefinition;
    return {
      name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: {
        readOnlyHint: definition.readOnlyHint ?? false,
        destructiveHint: definition.destructiveHint ?? false,
      },
    };
  }),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = (allTools as Record<string, unknown>)[name] as ToolDefinition | undefined;

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const limit = await rateLimiter.checkLimit(name);
  if (!limit.allowed) {
    return {
      content: [
        {
          type: 'text',
          text: `Rate limit reached for ${name}. Retry in ${limit.retryAfter} seconds.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.handler((args ?? {}) as never);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mcp-quipu running on stdio');
}

main().catch((error) => {
  console.error('Fatal error starting mcp-quipu:', error);
  process.exit(1);
});
