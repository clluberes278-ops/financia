import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptSecret } from '../_shared/crypto.ts';
import { getGmailAddress, refreshGoogleAccessToken } from '../_shared/gmail.ts';

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
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !encryptionKey || !authorization) {
      throw new Error('Gmail connection service is not configured.');
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders });

    const body = (await request.json()) as { refreshToken?: string };
    if (!body.refreshToken || body.refreshToken.length > 8192) {
      return Response.json({ error: 'A valid Google refresh token is required.' }, { status: 400, headers: corsHeaders });
    }

    const accessToken = await refreshGoogleAccessToken(body.refreshToken);
    const gmailEmail = await getGmailAddress(accessToken);
    const encryptedRefreshToken = await encryptSecret(body.refreshToken, encryptionKey);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: statusError } = await admin.from('gmail_connection_status').upsert({
      user_id: userData.user.id,
      gmail_email: gmailEmail,
      last_error: null,
    });
    if (statusError) throw new Error('Could not store Gmail connection status.');

    const { error: secretError } = await admin.from('gmail_connection_secrets').upsert({
      user_id: userData.user.id,
      encrypted_refresh_token: encryptedRefreshToken,
      updated_at: new Date().toISOString(),
    });
    if (secretError) throw new Error('Could not store the encrypted Gmail authorization.');

    return Response.json({ connected: true, email: gmailEmail }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not connect Gmail.';
    return Response.json({ error: message }, { status: 400, headers: corsHeaders });
  }
});
