import { describe, it, expect } from 'vitest';
import { quarterRange, sumAmounts } from '../tools/tax-summary.js';

describe('quarterRange', () => {
  it('maps each quarter to the Spanish tax calendar boundaries', () => {
    expect(quarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterRange(2026, 2)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(quarterRange(2026, 3)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('zero-pads single-digit months and days', () => {
    expect(quarterRange(2026, 1).from).toBe('2026-01-01');
  });

  it('rejects an invalid quarter instead of returning a silent wrong range', () => {
    expect(() => quarterRange(2026, 0)).toThrow(/Invalid quarter/);
    expect(() => quarterRange(2026, 5)).toThrow(/Invalid quarter/);
  });
});

describe('sumAmounts', () => {
  it('adds string amounts as returned by the API', () => {
    const rows = [{ vat_amount: '21.00' }, { vat_amount: '10.50' }, { vat_amount: '0.25' }];
    expect(sumAmounts(rows, 'vat_amount')).toEqual({ total: 31.75, unparseable: 0 });
  });

  it('accepts decimal commas', () => {
    const rows = [{ vat_amount: '21,00' }, { vat_amount: '10,50' }];
    expect(sumAmounts(rows, 'vat_amount')).toEqual({ total: 31.5, unparseable: 0 });
  });

  it('skips missing and empty values without counting them as errors', () => {
    const rows = [{ vat_amount: '10' }, {}, { vat_amount: null }, { vat_amount: '' }];
    expect(sumAmounts(rows, 'vat_amount')).toEqual({ total: 10, unparseable: 0 });
  });

  it('reports unparseable values instead of poisoning the total with NaN', () => {
    const rows = [{ vat_amount: '10' }, { vat_amount: 'n/a' }, { vat_amount: '5' }];
    const result = sumAmounts(rows, 'vat_amount');
    expect(result.total).toBe(15);
    expect(result.unparseable).toBe(1);
    expect(Number.isNaN(result.total)).toBe(false);
  });

  it('rounds to cents so floating point noise never reaches a tax figure', () => {
    const rows = [{ base: '0.1' }, { base: '0.2' }];
    expect(sumAmounts(rows, 'base').total).toBe(0.3);
  });

  it('returns zero for an empty collection', () => {
    expect(sumAmounts([], 'vat_amount')).toEqual({ total: 0, unparseable: 0 });
  });
});
