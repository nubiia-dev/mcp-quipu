import { QuipuClient, JsonApiResponse, flattenJsonApi } from '../quipu-client.js';

/**
 * Read-side attributes of an invoice, taken from `InvoiceAttributes` in the
 * official OpenAPI spec. Note the naming: the base amount is
 * `total_amount_without_taxes` and the tax is `vat_amount` — there is no
 * `total` or `subtotal` field, and assuming otherwise returns empty values.
 */
export interface InvoiceAttributes extends Record<string, unknown> {
  kind?: string;
  total_amount_without_taxes?: string;
  vat_amount?: string;
  retention_amount?: string;
  stage?: string;
  concepts?: unknown;
  notes?: string;
  last_sent_at?: string;
  download_pdf_url?: string;
  ephemeral_open_download_pdf_url?: string;
}

function invoicePayload(
  attributes: Record<string, unknown>,
  relationships?: Record<string, unknown>,
  id?: string
) {
  return {
    data: {
      type: 'invoices',
      ...(id ? { id } : {}),
      attributes,
      ...(relationships ? { relationships } : {}),
    },
  };
}

export function getInvoiceTools(client: QuipuClient) {
  return {
    list_invoices: {
      description:
        'List issued invoices from Quipu, with number, issue_date, due_date, total, subtotal and payment status. Paginated via `page`. Use `filter_from` and `filter_to` to bound the period — this is the tool to use when asked about revenue or VAT for a quarter, since Quipu has no endpoint that returns tax models directly and the figures must be derived from invoices.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          page: { type: 'number', description: 'Page number, starting at 1 (default: 1)' },
          filter_from: {
            type: 'string',
            description: 'Only invoices issued on or after this date (YYYY-MM-DD)',
          },
          filter_to: {
            type: 'string',
            description: 'Only invoices issued on or before this date (YYYY-MM-DD)',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { page?: number; filter_from?: string; filter_to?: string } = {}) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<JsonApiResponse<InvoiceAttributes>>(`/${slug}/invoices`, {
          page: args.page,
          'filter[from]': args.filter_from,
          'filter[to]': args.filter_to,
        });
        const items = flattenJsonApi(response);
        return {
          items,
          count: Array.isArray(items) ? items.length : 1,
          meta: response.meta,
        };
      },
    },

    get_invoice: {
      description: 'Get a single Quipu invoice by id, with all of its attributes and totals.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Invoice id' },
        },
        required: ['id'],
      },
      readOnlyHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<JsonApiResponse<InvoiceAttributes>>(
          `/${slug}/invoices/${args.id}`
        );
        return flattenJsonApi(response);
      },
    },

    create_invoice: {
      description:
        'Create an issued invoice in Quipu. Requires the contact id it is billed to and at least one line item. The contact must already have a tax_id (NIF/CIF) or Quipu will reject the invoice.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          contact_id: { type: 'string', description: 'Id of the contact being invoiced' },
          issue_date: { type: 'string', description: 'Issue date (YYYY-MM-DD)' },
          due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
          payment_method: {
            type: 'string',
            description: 'Payment method as accepted by Quipu (e.g. "bank_transfer", "cash")',
          },
          items: {
            type: 'array',
            description: 'Invoice line items',
            items: {
              type: 'object',
              properties: {
                concept: { type: 'string', description: 'Line description' },
                unitary_amount: { type: 'string', description: 'Unit price without tax' },
                quantity: { type: 'number', description: 'Quantity (default: 1)' },
                vat_percent: { type: 'number', description: 'VAT percentage (e.g. 21)' },
                retention_percent: {
                  type: 'number',
                  description: 'IRPF withholding percentage, if it applies (e.g. 15)',
                },
              },
              required: ['concept', 'unitary_amount'],
            },
          },
        },
        required: ['contact_id', 'items'],
      },
      handler: async (args: {
        contact_id: string;
        issue_date?: string;
        due_date?: string;
        payment_method?: string;
        items: Array<Record<string, unknown>>;
      }) => {
        const slug = await client.getOwnerSlug();
        const { contact_id, items, ...attributes } = args;
        const response = await client.post<JsonApiResponse<InvoiceAttributes>>(
          `/${slug}/invoices`,
          invoicePayload(
            { ...attributes, items },
            {
              contact: { data: { id: contact_id, type: 'contacts' } },
            }
          )
        );
        return flattenJsonApi(response);
      },
    },

    update_invoice: {
      description:
        'Update an existing Quipu invoice. Note that Spanish invoicing rules restrict what can change once an invoice is issued and numbered; Quipu returns an error when a field is locked.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Invoice id' },
          issue_date: { type: 'string', description: 'Issue date (YYYY-MM-DD)' },
          due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
          paid_at: { type: 'string', description: 'Date the invoice was paid (YYYY-MM-DD)' },
          payment_method: { type: 'string', description: 'Payment method' },
        },
        required: ['id'],
      },
      handler: async (args: { id: string } & Record<string, unknown>) => {
        const slug = await client.getOwnerSlug();
        const { id, ...attributes } = args;
        const response = await client.patch<JsonApiResponse<InvoiceAttributes>>(
          `/${slug}/invoices/${id}`,
          invoicePayload(attributes, undefined, id)
        );
        return flattenJsonApi(response);
      },
    },

    delete_invoice: {
      description:
        'Delete a Quipu invoice permanently. Spanish invoicing rules generally require issuing a credit note instead of deleting a numbered invoice — prefer that unless the invoice is still a draft.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Invoice id' },
        },
        required: ['id'],
      },
      destructiveHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        await client.delete(`/${slug}/invoices/${args.id}`);
        return { deleted: true, id: args.id };
      },
    },

    get_invoice_download_url: {
      description:
        'Get a temporary public URL to download a Quipu invoice as PDF. The link is ephemeral and expires, so fetch it when the user actually needs the document rather than storing it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Invoice id' },
        },
        required: ['id'],
      },
      readOnlyHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<Record<string, unknown>>(
          `/${slug}/invoices/${args.id}/ephemeral_open_download`
        );
        return response;
      },
    },
  };
}
