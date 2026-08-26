import { QuipuClient, JsonApiResponse, flattenJsonApi } from '../quipu-client.js';

/**
 * Read-side attributes, from `AdditionalIncomeAttributes` in the OpenAPI spec.
 * Same naming trap as invoices: the base amount is `total_amount_without_taxes`
 * and the tax is `vat_amount`.
 */
export interface AdditionalIncomeAttributes extends Record<string, unknown> {
  kind?: string;
  total_amount_without_taxes?: string;
  vat_amount?: string;
  retention_amount?: string;
  notes?: string;
}

function additionalIncomePayload(
  attributes: Record<string, unknown>,
  relationships?: Record<string, unknown>,
  id?: string
) {
  return {
    data: {
      type: 'additional_incomes',
      ...(id ? { id } : {}),
      attributes,
      ...(relationships ? { relationships } : {}),
    },
  };
}

export function getAdditionalIncomeTools(client: QuipuClient) {
  return {
    list_additional_incomes: {
      description:
        'List additional incomes and expenses recorded in Quipu — everything that is not an issued invoice: supplier bills, purchases, tickets and other deductible costs. Returns kind, total_amount_without_taxes, vat_amount and retention_amount. Bound the period with `filter_from` / `filter_to`. This is the input-VAT side needed to work out what a quarter actually owes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          page: { type: 'number', description: 'Page number, starting at 1 (default: 1)' },
          filter_from: {
            type: 'string',
            description: 'Only entries issued on or after this date (YYYY-MM-DD)',
          },
          filter_to: {
            type: 'string',
            description: 'Only entries issued on or before this date (YYYY-MM-DD)',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { page?: number; filter_from?: string; filter_to?: string } = {}) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<JsonApiResponse<AdditionalIncomeAttributes>>(
          `/${slug}/additional_incomes`,
          {
            page: args.page,
            'filter[from]': args.filter_from,
            'filter[to]': args.filter_to,
          }
        );
        const items = flattenJsonApi(response);
        return {
          items,
          count: Array.isArray(items) ? items.length : 1,
          meta: response.meta,
        };
      },
    },

    get_additional_income: {
      description: 'Get a single additional income or expense entry from Quipu by its id.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Additional income id' },
        },
        required: ['id'],
      },
      readOnlyHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<JsonApiResponse<AdditionalIncomeAttributes>>(
          `/${slug}/additional_incomes/${args.id}`
        );
        return flattenJsonApi(response);
      },
    },

    create_additional_income: {
      description:
        'Record an expense or additional income in Quipu. Use it to log supplier bills and deductible costs. Assign an `accounting_category_id` whenever you know it — an uncategorised expense still counts for VAT but is useless for the profit and loss breakdown.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          kind: {
            type: 'string',
            description: 'Entry kind as accepted by Quipu (e.g. "expense", "income")',
          },
          issue_date: { type: 'string', description: 'Issue date (YYYY-MM-DD)' },
          paid_at: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
          number: { type: 'string', description: 'Supplier document number' },
          payment_method: { type: 'string', description: 'Payment method' },
          recipient_name: { type: 'string', description: 'Supplier or recipient name' },
          notes: { type: 'string', description: 'Free-text notes' },
          contact_id: { type: 'string', description: 'Id of the related Quipu contact, if any' },
          accounting_category_id: {
            type: 'string',
            description: 'Id of the accounting category to file this entry under',
          },
          items: {
            type: 'array',
            description: 'Line items of the expense',
            items: {
              type: 'object',
              properties: {
                concept: { type: 'string', description: 'Line description' },
                unitary_amount: { type: 'string', description: 'Unit price without tax' },
                quantity: { type: 'number', description: 'Quantity (default: 1)' },
                vat_percent: { type: 'number', description: 'VAT percentage (e.g. 21)' },
                retention_percent: {
                  type: 'number',
                  description: 'IRPF withholding percentage, if it applies',
                },
              },
              required: ['concept', 'unitary_amount'],
            },
          },
        },
        required: ['items'],
      },
      handler: async (args: {
        contact_id?: string;
        accounting_category_id?: string;
        items: Array<Record<string, unknown>>;
        [key: string]: unknown;
      }) => {
        const slug = await client.getOwnerSlug();
        const { contact_id, accounting_category_id, ...attributes } = args;

        const relationships: Record<string, unknown> = {};
        if (contact_id) {
          relationships.contact = { data: { id: contact_id, type: 'contacts' } };
        }
        if (accounting_category_id) {
          relationships.accounting_category = {
            data: { id: accounting_category_id, type: 'accounting_categories' },
          };
        }

        const response = await client.post<JsonApiResponse<AdditionalIncomeAttributes>>(
          `/${slug}/additional_incomes`,
          additionalIncomePayload(
            attributes,
            Object.keys(relationships).length > 0 ? relationships : undefined
          )
        );
        return flattenJsonApi(response);
      },
    },

    update_additional_income: {
      description:
        'Update an existing additional income or expense in Quipu. Only the fields passed are modified.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Additional income id' },
          issue_date: { type: 'string', description: 'Issue date (YYYY-MM-DD)' },
          paid_at: { type: 'string', description: 'Payment date (YYYY-MM-DD)' },
          number: { type: 'string', description: 'Supplier document number' },
          payment_method: { type: 'string', description: 'Payment method' },
          recipient_name: { type: 'string', description: 'Supplier or recipient name' },
          notes: { type: 'string', description: 'Free-text notes' },
        },
        required: ['id'],
      },
      handler: async (args: { id: string } & Record<string, unknown>) => {
        const slug = await client.getOwnerSlug();
        const { id, ...attributes } = args;
        const response = await client.patch<JsonApiResponse<AdditionalIncomeAttributes>>(
          `/${slug}/additional_incomes/${id}`,
          additionalIncomePayload(attributes, undefined, id)
        );
        return flattenJsonApi(response);
      },
    },

    delete_additional_income: {
      description: 'Delete an additional income or expense entry from Quipu permanently.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Additional income id' },
        },
        required: ['id'],
      },
      destructiveHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        await client.delete(`/${slug}/additional_incomes/${args.id}`);
        return { deleted: true, id: args.id };
      },
    },

    get_additional_income_download_url: {
      description:
        'Get a temporary public URL to download an expense document as PDF. The link is ephemeral and expires.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Additional income id' },
        },
        required: ['id'],
      },
      readOnlyHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        return client.get<Record<string, unknown>>(
          `/${slug}/additional_incomes/${args.id}/ephemeral_open_download`
        );
      },
    },
  };
}
