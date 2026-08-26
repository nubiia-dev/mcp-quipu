import { QuipuClient, JsonApiResponse, flattenJsonApi } from '../quipu-client.js';
import type { InvoiceAttributes } from './invoices.js';
import type { AdditionalIncomeAttributes } from './additional-incomes.js';

/** Quarter boundaries as used by the Spanish tax calendar. */
const QUARTERS: Record<number, { from: [number, number]; to: [number, number] }> = {
  1: { from: [1, 1], to: [3, 31] },
  2: { from: [4, 1], to: [6, 30] },
  3: { from: [7, 1], to: [9, 30] },
  4: { from: [10, 1], to: [12, 31] },
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const q = QUARTERS[quarter];
  if (!q) {
    throw new Error(`Invalid quarter: ${quarter}. Use 1, 2, 3 or 4.`);
  }
  return {
    from: `${year}-${pad(q.from[0])}-${pad(q.from[1])}`,
    to: `${year}-${pad(q.to[0])}-${pad(q.to[1])}`,
  };
}

/**
 * Quipu returns money as strings. Parse defensively: a silent NaN would
 * corrupt a tax figure, so anything unparseable counts as zero and is
 * reported separately instead of poisoning the total.
 */
export function sumAmounts(
  rows: Array<Record<string, unknown>>,
  field: string
): { total: number; unparseable: number } {
  let total = 0;
  let unparseable = 0;
  for (const row of rows) {
    const raw = row[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(String(raw).replace(',', '.'));
    if (Number.isFinite(value)) {
      total += value;
    } else {
      unparseable += 1;
    }
  }
  return { total: Math.round(total * 100) / 100, unparseable };
}

/** Walk every page of a paginated collection, with a hard cap as a backstop. */
async function fetchAll<T extends Record<string, unknown>>(
  client: QuipuClient,
  path: string,
  from: string,
  to: string,
  maxPages = 50
): Promise<Array<T & { id: string }>> {
  const rows: Array<T & { id: string }> = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = await client.get<JsonApiResponse<T>>(path, {
      page,
      'filter[from]': from,
      'filter[to]': to,
    });
    const flattened = flattenJsonApi(response);
    const batch = Array.isArray(flattened) ? flattened : [flattened];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < 25) break; // short page: no more results
  }
  return rows;
}

export function getTaxSummaryTools(client: QuipuClient) {
  return {
    get_tax_summary: {
      description:
        'Work out the VAT and IRPF position for a period from the invoices and expenses recorded in Quipu. Give it a year and a quarter (or an explicit date range) and it returns output VAT charged on invoices, input VAT paid on expenses, the resulting balance, and withholdings. Use this instead of listing invoices and adding them up by hand: Quipu has no endpoint that returns tax models (130, 303, 111), so the figures must be derived, and doing the arithmetic in code avoids the mistakes that come from adding long lists token by token. Treat the result as an estimate for orientation, not as a filed return.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          year: { type: 'number', description: 'Year, e.g. 2026' },
          quarter: {
            type: 'number',
            description: 'Quarter: 1, 2, 3 or 4. Ignored when `from` and `to` are provided',
          },
          from: { type: 'string', description: 'Start date (YYYY-MM-DD), overrides quarter' },
          to: { type: 'string', description: 'End date (YYYY-MM-DD), overrides quarter' },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: async (
        args: { year?: number; quarter?: number; from?: string; to?: string } = {}
      ) => {
        let from = args.from;
        let to = args.to;

        if (!from || !to) {
          if (!args.year || !args.quarter) {
            throw new Error(
              'Provide either an explicit `from` and `to` range, or a `year` and `quarter`.'
            );
          }
          ({ from, to } = quarterRange(args.year, args.quarter));
        }

        const slug = await client.getOwnerSlug();

        const [invoices, expenses] = await Promise.all([
          fetchAll<InvoiceAttributes>(client, `/${slug}/invoices`, from, to),
          fetchAll<AdditionalIncomeAttributes>(client, `/${slug}/additional_incomes`, from, to),
        ]);

        const invoiceBase = sumAmounts(invoices, 'total_amount_without_taxes');
        const invoiceVat = sumAmounts(invoices, 'vat_amount');
        const invoiceRetention = sumAmounts(invoices, 'retention_amount');

        const expenseBase = sumAmounts(expenses, 'total_amount_without_taxes');
        const expenseVat = sumAmounts(expenses, 'vat_amount');
        const expenseRetention = sumAmounts(expenses, 'retention_amount');

        const vatBalance = Math.round((invoiceVat.total - expenseVat.total) * 100) / 100;
        const skipped =
          invoiceBase.unparseable +
          invoiceVat.unparseable +
          expenseBase.unparseable +
          expenseVat.unparseable;

        return {
          period: { from, to },
          income: {
            documents: invoices.length,
            base: invoiceBase.total,
            output_vat: invoiceVat.total,
            withholdings: invoiceRetention.total,
          },
          expenses: {
            documents: expenses.length,
            base: expenseBase.total,
            input_vat: expenseVat.total,
            withholdings: expenseRetention.total,
          },
          vat_balance: vatBalance,
          vat_balance_meaning:
            vatBalance >= 0
              ? 'Positive: output VAT exceeds input VAT, so this amount is payable to the tax authority.'
              : 'Negative: input VAT exceeds output VAT, so this amount is refundable or carried forward.',
          profit_before_tax: Math.round((invoiceBase.total - expenseBase.total) * 100) / 100,
          ...(skipped > 0
            ? {
                warning: `${skipped} amount field(s) could not be parsed and were excluded. The totals are incomplete.`,
              }
            : {}),
          disclaimer:
            'Estimate derived from the documents recorded in Quipu. It is not a filed tax return and does not account for special regimes, prorrata, intra-EU operations or non-deductible input VAT.',
        };
      },
    },
  };
}
