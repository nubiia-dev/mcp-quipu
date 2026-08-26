import { QuipuClient, JsonApiResponse, flattenJsonApi } from '../quipu-client.js';

interface ContactAttributes extends Record<string, unknown> {
  name?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  town?: string;
  zip_code?: string;
  country_code?: string;
}

/**
 * Build the JSON:API request body Quipu expects for writes.
 * Every payload is wrapped in `data.attributes` under a resource `type`.
 */
function contactPayload(attributes: Record<string, unknown>, id?: string) {
  return {
    data: {
      type: 'contacts',
      ...(id ? { id } : {}),
      attributes,
    },
  };
}

export function getContactTools(client: QuipuClient) {
  return {
    list_contacts: {
      description:
        'List contacts (clients and suppliers) from Quipu. Returns id, name, tax_id (NIF/CIF), email, phone and address fields. Results are paginated: use `page` to walk through pages. Quipu returns JSON:API, but this tool flattens each resource so attributes appear at the top level alongside `id`.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          page: {
            type: 'number',
            description: 'Page number, starting at 1 (default: 1)',
          },
          filter_name: {
            type: 'string',
            description: 'Filter contacts whose name contains this text',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (args: { page?: number; filter_name?: string } = {}) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<JsonApiResponse<ContactAttributes>>(`/${slug}/contacts`, {
          page: args.page,
          'filter[name]': args.filter_name,
        });
        const items = flattenJsonApi(response);
        return {
          items,
          count: Array.isArray(items) ? items.length : 1,
          meta: response.meta,
        };
      },
    },

    get_contact: {
      description:
        'Get a single Quipu contact by its id, with all available attributes (name, tax_id, email, phone, address, town, zip_code, country_code).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Contact id' },
        },
        required: ['id'],
      },
      readOnlyHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        const response = await client.get<JsonApiResponse<ContactAttributes>>(
          `/${slug}/contacts/${args.id}`
        );
        return flattenJsonApi(response);
      },
    },

    create_contact: {
      description:
        'Create a contact in Quipu. `name` is required. Provide `tax_id` (NIF/CIF) whenever the contact will be invoiced — Spanish invoices require it and Quipu will reject the invoice later without it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Contact name or company name' },
          tax_id: {
            type: 'string',
            description: 'NIF/CIF. Required to issue invoices to this contact',
          },
          email: { type: 'string', description: 'Contact email' },
          phone: { type: 'string', description: 'Contact phone number' },
          address: { type: 'string', description: 'Street address' },
          town: { type: 'string', description: 'Town or city' },
          zip_code: { type: 'string', description: 'Postal code' },
          country_code: {
            type: 'string',
            description: 'ISO 3166-1 alpha-2 country code (e.g. "ES")',
          },
        },
        required: ['name'],
      },
      handler: async (args: ContactAttributes & { name: string }) => {
        const slug = await client.getOwnerSlug();
        const response = await client.post<JsonApiResponse<ContactAttributes>>(
          `/${slug}/contacts`,
          contactPayload({ ...args })
        );
        return flattenJsonApi(response);
      },
    },

    update_contact: {
      description:
        'Update an existing Quipu contact. Only the fields you pass are modified; everything else is left untouched.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Contact id' },
          name: { type: 'string', description: 'Contact name or company name' },
          tax_id: { type: 'string', description: 'NIF/CIF' },
          email: { type: 'string', description: 'Contact email' },
          phone: { type: 'string', description: 'Contact phone number' },
          address: { type: 'string', description: 'Street address' },
          town: { type: 'string', description: 'Town or city' },
          zip_code: { type: 'string', description: 'Postal code' },
          country_code: { type: 'string', description: 'ISO 3166-1 alpha-2 country code' },
        },
        required: ['id'],
      },
      handler: async (args: ContactAttributes & { id: string }) => {
        const slug = await client.getOwnerSlug();
        const { id, ...attributes } = args;
        const response = await client.patch<JsonApiResponse<ContactAttributes>>(
          `/${slug}/contacts/${id}`,
          contactPayload(attributes, id)
        );
        return flattenJsonApi(response);
      },
    },

    delete_contact: {
      description:
        'Delete a Quipu contact permanently. Quipu refuses to delete contacts that already have invoices attached; in that case the API returns an error explaining it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string', description: 'Contact id' },
        },
        required: ['id'],
      },
      destructiveHint: true,
      handler: async (args: { id: string }) => {
        const slug = await client.getOwnerSlug();
        await client.delete(`/${slug}/contacts/${args.id}`);
        return { deleted: true, id: args.id };
      },
    },
  };
}
