import type { EmailInput, ParsedTransaction } from './bankEmailParser.ts';
import { parseBankAmount } from './bankMoney.ts';

const BANK_SENDER_MAP: Array<[RegExp, string]> = [
  [/bhd\.com\.do/i, 'bhd'],
  [/scotiabank\.com\.do/i, 'scotiabank'],
  [/banreservas\.com\.do/i, 'banreservas'],
  [/bpd\.com\.do|popular\.com\.do|bancopopular/i, 'banco-popular'],
  [/gmail|outlook|yahoo/i, 'banco'],
];

function detectBank(sender: string): string {
  const normalized = sender.toLowerCase();
  for (const [pattern, bankName] of BANK_SENDER_MAP) {
    if (pattern.test(normalized)) return bankName;
  }
  const domain = sender.includes('@') ? sender.split('@')[1]?.split(/[/?#]/)[0] ?? 'banco' : 'banco';
  return domain === 'banco' ? 'banco' : domain.replace(/\./g, '-');
}

function extractAmount(value: string): { amount: number; currency: 'DOP' | 'USD' } | null {
  // A card number, date or account balance must not become the transaction amount.
  // Bare "$" is ambiguous until a bank-specific format establishes its currency.
  const pattern = /(?:^|[^\w])((?:RD|US)\s*\$|USD\b|DOP\b)\s*([+-]?\d[\d.,]*)(?=$|[\s;:!?()<>])/gi;
  let result: { amount: number; currency: 'DOP' | 'USD' } | null = null;
  for (const match of value.matchAll(pattern)) {
    const amount = parseBankAmount(match[2]);
    if (amount === null) return null;
    const currency = /^US/i.test(match[1]) ? 'USD' : 'DOP';
    if (result && (result.amount !== amount || result.currency !== currency)) return null;
    result = { amount, currency };
  }
  return result;
}

function extractDate(value: string): string | null {
  const candidates = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(?:a\.?m\.?|p\.?m\.?)/i,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{1,2})\s+de\s+[a-zA-Z]+\s+de\s+(\d{4})/i,
    /([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
  ];

  for (const pattern of candidates) {
    const match = pattern.exec(value);
    if (!match) continue;
    try {
      const date = new Date(match[0]);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    } catch {
      // ignored, continue with other candidates
    }
  }

  return null;
}

function extractMerchant(value: string): string {
  const lines = value
    .split(/\r?\n|\s{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    if (/\b(?:transacci[oó]n|compra|purchase|cargo|pago|retiro|abono|cr[eé]dito|d[eé]bito|transferencia|deposito)\b/i.test(line)) {
      continue;
    }
    const isMetadata = /(?:banco|cuenta|fecha|monto|saldo|alerta|n[oó]tifica|id|ref|orden|autoriz|telefono|correo|email)/i.test(line);
    if (!isMetadata && line.length > 2 && line.length < 80) return line;
  }

  return 'Movimiento bancario';
}

export function parseGenericBankEmail(input: EmailInput): ParsedTransaction | null {
  const haystack = `${input.subject}\n${input.body}`;
  const looksLikeBankAlert = /(transacci[oó]n|compra|purchase|d[eé]bito|cr[eé]dito|transferencia|pago|retiro|cargo|abono|deposito|movimiento)/i.test(haystack);
  if (!looksLikeBankAlert) return null;

  const money = extractAmount(haystack);
  if (!money) return null;

  const date = extractDate(haystack) ?? new Date().toISOString();
  const merchant = extractMerchant(haystack);
  const bank = detectBank(input.sender);
  const type = /(d[eé]bito|compra|cargo|retiro|pago|purchase|debit|withdraw|payment)/i.test(haystack) ? 'gasto' : 'ingreso';

  const bankLabel = bank
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    gmailMessageId: input.gmailMessageId,
    amount: money.amount,
    currency: money.currency,
    type,
    category: 'otros',
    date,
    merchant,
    note: `${bankLabel || 'Banco'} · ${merchant}`,
    bank,
  };
}
