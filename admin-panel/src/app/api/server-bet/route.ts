import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  signalId: z.number().int(),
  auto: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const accessToken = authorization.replace('Bearer ', '').trim();

  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data: signal, error: signalError } = await supabaseAdmin
    .from('bet_signals')
    .select('id, race_type, jo_name, race_no, bet_type_name, kaime_data, suggested_amount')
    .eq('id', parsed.data.signalId)
    .single();

  if (signalError || !signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  const serviceUrl = process.env.PLAYWRIGHT_SERVICE_URL?.replace(/\/$/, '');
  const serviceApiKey = process.env.PLAYWRIGHT_SERVICE_API_KEY;
  if (!serviceUrl || !serviceApiKey) {
    return NextResponse.json({ error: 'Playwright service is not configured' }, { status: 503 });
  }

  const kaimeList = Array.isArray(signal.kaime_data)
    ? (signal.kaime_data as string[])
    : [];

  const payload = {
    userId: userResult.user.id,
    signal: {
      id: signal.id,
      race_type: signal.race_type,
      jo_name: signal.jo_name,
      race_no: signal.race_no,
      bet_type_name: signal.bet_type_name,
      kaime_data: kaimeList,
      suggested_amount: signal.suggested_amount,
    },
    options: { auto: parsed.data.auto ?? false, headless: true },
  };

  const response = await fetch(`${serviceUrl}/api/execute-bet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': serviceApiKey,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  return NextResponse.json(result, { status: response.status });
}
