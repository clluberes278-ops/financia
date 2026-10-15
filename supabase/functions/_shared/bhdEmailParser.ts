type TransactionType = 'ingreso' | 'gasto';
type Category = 'comida' | 'transporte' | 'entretenimiento' | 'servicios' | 'salud' | 'educacion' | 'salario' | 'ahorro' | 'otros';

export interface ParsedBhdEmailTransaction {
  gmailMessageId: string;
  amount: number;
  currency: 'DOP';
  type: TransactionType;
  category: Category;
  date: string;
  merchant: string;
  note: string;
}

export interface BhdEmailInput {
  gmailMessageId: string;
  sender: string;
  subject: string;
  body: string;
}

const BHD_SENDERS = new Set(['alertas@bhd.com.do', 'notificaciones@bhd.com.do']);

function parseAmount(value: string): number | null {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/,/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseDominicanDate(value: string): string | null {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i.exec(value);
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText, meridiemText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const hour12 = Number(hourText);
  const minute = Number(minuteText);
  const isAfternoon = meridiemText.toLowerCase().startsWith('p');
  if (day < 1 || day > 31 || month < 1 || month > 12 || hour12 < 1 || hour12 > 12 || minute > 59) return null;

  const hour = (hour12 % 12) + (isAfternoon ? 12 : 0);
  const date = new Date(`${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return null;
  return date.toISOString();
}

function parsePurchase(input: BhdEmailInput): ParsedBhdEmailTransaction | null {
  if (!/transacci[oó]n realizada|detalle de transacciones/i.test(input.body)) return null;
  if (!/aprobada|approved/i.test(input.body) || !/compra|purchase/i.test(input.body)) return null;

  const amountMatch = /(?:RD\s*)?\$\s*([\d,]+\.\d{2})/i.exec(input.body);
  const dateMatch = /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?)/i.exec(input.body);
  const merchantMatch = /(?:\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?[\s\S]{0,120}?\$[\d,]+\.\d{2}\s+)([^\r\n<>]{2,80}?)\s+(?:Aprobada|Approved)\b/i.exec(input.body);
  if (!amountMatch || !dateMatch || !merchantMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const date = parseDominicanDate(dateMatch[1]);
  const merchant = merchantMatch[1].trim().replace(/\s+/g, ' ');
  if (!amount || !date || !merchant) return null;

  return {
    gmailMessageId: input.gmailMessageId,
    amount,
    currency: 'DOP',
    type: 'gasto',
    category: 'otros',
    date,
    merchant,
    note: `BHD · ${merchant}`,
  };
}

function parseIncomingTransfer(input: BhdEmailInput): ParsedBhdEmailTransaction | null {
  if (!/has recibido una transferencia de pago al instante/i.test(input.body)) return null;

  const amountMatch = /Monto\s*:\s*(?:RD\s*)?\$\s*([\d,]+\.\d{2})/i.exec(input.body);
  const dateMatch = /Fecha y hora de la transacci[oó]n\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?)/i.exec(input.body);
  if (!amountMatch || !dateMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const date = parseDominicanDate(dateMatch[1]);
  if (!amount || !date) return null;

  return {
    gmailMessageId: input.gmailMessageId,
    amount,
    currency: 'DOP',
    type: 'ingreso',
    category: 'otros',
    date,
    merchant: 'Transferencia Pago al Instante',
    note: 'BHD · Transferencia recibida',
  };
}

export function parseBhdEmail(input: BhdEmailInput): ParsedBhdEmailTransaction | null {
  const sender = input.sender.trim().toLowerCase();
  if (!BHD_SENDERS.has(sender) || !input.gmailMessageId.trim()) return null;

  const body = `${input.subject}\n${input.body}`;
  if (sender === 'alertas@bhd.com.do') return parsePurchase({ ...input, body });
  if (sender === 'notificaciones@bhd.com.do') return parseIncomingTransfer({ ...input, body });
  return null;
}
