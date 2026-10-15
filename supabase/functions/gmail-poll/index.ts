import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/crypto.ts';
import { getGmailAddress, listBhdNotices, refreshGoogleAccessToken } from '../_shared/gmail.ts';
import { parseBhdEmail } from '../_shared/bhdEmailParser.ts';

interface GmailConnectionSecret {
  user_id: string;
  encrypted_refresh_token: string;
}

interface GmailConnectionStatus {
  user_id: string;
  last_synced_at: string;
  initial_backfill_complete: boolean;
}

function safeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  const expectedSecret = Deno.env.get('GMAIL_CRON_SECRET');
  const suppliedSecret = request.headers.get('x-cron-secret') ?? '';
  if (request.method !== 'POST' || !expectedSecret || !safeEquals(expectedSecret, suppliedSecret)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const encryptionKey = Deno.env.get('GMAIL_REFRESH_TOKEN_KEY');
  if (!supabaseUrl || !serviceRoleKey || !encryptionKey) {
    return Response.json({ error: 'Gmail polling service is not configured.' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: connections, error: connectionsError }, { data: statuses, error: statusesError }] = await Promise.all([
    admin.from('gmail_connection_secrets').select('user_id, encrypted_refresh_token'),
    admin.from('gmail_connection_status').select('user_id, last_synced_at, initial_backfill_complete'),
  ]);
  if (connectionsError || statusesError) return Response.json({ error: 'Could not load Gmail connections.' }, { status: 500 });

  const statusByUser = new Map((statuses as GmailConnectionStatus[]).map((status) => [status.user_id, status]));
  let processed = 0;
  let inserted = 0;
  let failed = 0;

  for (const connection of (connections ?? []) as GmailConnectionSecret[]) {
    const currentStatus = statusByUser.get(connection.user_id);
    try {
      const refreshToken = await decryptSecret(connection.encrypted_refresh_token, encryptionKey);
      const accessToken = await refreshGoogleAccessToken(refreshToken);
      const gmailEmail = await getGmailAddress(accessToken);
      const lastSynced = currentStatus?.last_synced_at ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const overlapSeconds = currentStatus?.initial_backfill_complete ? 48 * 60 * 60 : 0;
      const after = Math.floor(new Date(lastSynced).getTime() / 1000) - overlapSeconds;
      const notices = await listBhdNotices(accessToken, after);
      const transactions = notices
        .map((notice) => parseBhdEmail({
          gmailMessageId: notice.id,
          sender: notice.sender,
          subject: notice.subject,
          body: notice.body,
        }))
        .filter((transaction) => transaction !== null);

      if (transactions.length > 0) {
        const { data: savedTransactions, error } = await admin.from('bank_email_transactions').upsert(
          transactions.map((transaction) => ({
            user_id: connection.user_id,
            bank: 'bhd',
            gmail_message_id: transaction.gmailMessageId,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            category: transaction.category,
            occurred_at: transaction.date,
            merchant: transaction.merchant,
            note: transaction.note,
          })),
          { onConflict: 'user_id,gmail_message_id', ignoreDuplicates: true }
        ).select('gmail_message_id');
        if (error) throw new Error('Could not save extracted bank transactions.');
        inserted += savedTransactions?.length ?? 0;
      }

      const { error: statusError } = await admin.from('gmail_connection_status').upsert({
        user_id: connection.user_id,
        gmail_email: gmailEmail,
        last_synced_at: new Date().toISOString(),
        initial_backfill_complete: true,
        last_error: null,
      });
      if (statusError) throw new Error('Could not update Gmail sync status.');
      processed += 1;
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.includes('revoked or expired')
        ? 'Google authorization expired. Reconnect Gmail.'
        : 'Gmail sync failed. Check the connection and try again.';
      const { error: statusError } = await admin
        .from('gmail_connection_status')
        .update({ last_error: message })
        .eq('user_id', connection.user_id);
      if (statusError) return Response.json({ error: 'Could not update Gmail sync status.' }, { status: 500 });
      failed += 1;
    }
  }

  return Response.json({ connections: connections?.length ?? 0, processed, inserted, failed });
});
