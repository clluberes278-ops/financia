const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

export interface GmailNotice {
  id: string;
  sender: string;
  subject: string;
  body: string;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function collectBodies(part: GmailPart, output: { plain: string[]; html: string[] }): void {
  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === 'text/plain') output.plain.push(decoded);
    if (part.mimeType === 'text/html') output.html.push(decoded);
  }
  part.parts?.forEach((child) => collectBodies(child, output));
}

function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/?(?:td|th|tr|p|div|br|li|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCharCode(Number(decimal)))
    .replace(/&#x([a-f\d]+);/gi, (_match, hexadecimal: string) => String.fromCharCode(parseInt(hexadecimal, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find((header) => header.name?.toLowerCase() === name)?.value ?? '';
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Google OAuth server credentials are not configured.');

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const result = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(result.error === 'invalid_grant' ? 'Google authorization was revoked or expired.' : 'Google could not refresh Gmail access.');
  }
  return result.access_token;
}

async function gmailRequest<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Gmail authorization is no longer valid.');
    throw new Error(`Gmail API request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

export async function getGmailAddress(accessToken: string): Promise<string> {
  const profile = await gmailRequest<{ emailAddress?: string }>(accessToken, 'profile');
  if (!profile.emailAddress) throw new Error('Google did not return a Gmail address.');
  return profile.emailAddress;
}

const BANK_ALERT_SENDERS = [
  'alertas@bhd.com.do',
  'notificaciones@bhd.com.do',
  'notificaciones@scotiabank.com.do',
  'alertas@scotiabank.com.do',
  'noreply@banreservas.com.do',
  'alertas@banreservas.com.do',
  'notificaciones@bpd.com.do',
  'alertas@bpd.com.do',
];

export async function listBankNotices(
  accessToken: string,
  afterUnixSeconds: number
): Promise<GmailNotice[]> {
  const query = `after:${afterUnixSeconds} (${BANK_ALERT_SENDERS.map((sender) => `from:${sender}`).join(' OR ')})`;
  const notices: GmailNotice[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({ q: query, maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await gmailRequest<{
      messages?: Array<{ id?: string }>;
      nextPageToken?: string;
    }>(accessToken, `messages?${params.toString()}`);

    const messages = result.messages ?? [];
    for (let start = 0; start < messages.length; start += 10) {
      const messageBatch = messages.slice(start, start + 10);
      const batchNotices = await Promise.all(messageBatch.map(async (message): Promise<GmailNotice | null> => {
        if (!message.id) return null;
        const full = await gmailRequest<GmailMessage>(accessToken, `messages/${encodeURIComponent(message.id)}?format=full`);
        if (!full.id || !full.payload) return null;

        const headers = full.payload.headers ?? [];
        const bodies = { plain: [] as string[], html: [] as string[] };
        collectBodies(full.payload, bodies);
        const plainBody = bodies.plain.join('\n');
        const body = plainBody.trim() ? plainBody : bodies.html.map(htmlToText).join('\n');
        const senderHeader = headerValue(headers, 'from');
        const sender = /<([^>]+)>/.exec(senderHeader)?.[1] ?? senderHeader.trim();

        return {
          id: full.id,
          sender: sender.replace(/^mailto:/i, '').trim().toLowerCase(),
          subject: headerValue(headers, 'subject'),
          body,
        };
      }));
      notices.push(...batchNotices.filter((notice): notice is GmailNotice => notice !== null));
    }

    pageToken = result.nextPageToken;
    pageCount += 1;
    if (pageCount >= 20 && pageToken) {
      throw new Error('Gmail has more than 10,000 matching notices; narrow the initial import range.');
    }
  } while (pageToken);

  return notices;
}

export async function listBhdNotices(
  accessToken: string,
  afterUnixSeconds: number
): Promise<GmailNotice[]> {
  return listBankNotices(accessToken, afterUnixSeconds);
}
