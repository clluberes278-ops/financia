import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/crypto.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const encryptionKey = Deno.env.get('GMAIL_REFRESH_TOKEN_KEY');
    const authorization = request.headers.get('authorization');
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !encryptionKey || !authorization) throw new Error('Gmail service is not configured.');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: connection, error: readError } = await admin
      .from('gmail_connection_secrets')
      .select('encrypted_refresh_token')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (readError) throw new Error('Could not load the Gmail authorization.');

    let revocationConfirmed = true;
    if (connection?.encrypted_refresh_token) {
      try {
        const refreshToken = await decryptSecret(connection.encrypted_refresh_token, encryptionKey);
        const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        });
        revocationConfirmed = revokeResponse.ok;
      } catch {
        revocationConfirmed = false;
      }
    }

    const { error } = await admin.from('gmail_connection_secrets').delete().eq('user_id', userData.user.id);
    if (error) throw new Error('Could not disconnect Gmail.');

    const { error: statusError } = await admin.from('gmail_connection_status').delete().eq('user_id', userData.user.id);
    if (statusError) throw new Error('Could not clear Gmail connection status.');

    return Response.json({ connected: false, revocationConfirmed }, { headers: corsHeaders });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not disconnect Gmail.' },
      { status: 400, headers: corsHeaders }
    );
  }
});
