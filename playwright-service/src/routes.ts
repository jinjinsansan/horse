import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enqueueBetJob } from './jobs/job-runner.js';
import { supabaseAdmin } from './supabase.js';
import { fetchJraOdds } from '@horsebet/shared/automation';

const executeSchema = z.object({
  userId: z.string().uuid(),
  signal: z.object({
    id: z.number().int(),
    race_type: z.enum(['JRA', 'NAR']),
    jo_name: z.string(),
    race_no: z.number().int(),
    bet_type_name: z.string(),
    kaime_data: z.array(z.string()),
    suggested_amount: z.number().int().positive(),
  }),
  options: z
    .object({
      auto: z.boolean().optional(),
      headless: z.boolean().optional(),
    })
    .optional(),
});

const oddsSchema = z.object({
  joName: z.string(),
  raceNo: z.number().int().min(1).max(12),
});

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  app.post('/api/execute-bet', async (request, reply) => {
    const parseResult = executeSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid payload', issues: parseResult.error.flatten() });
    }

    const { userId, signal, options } = parseResult.data;
    const { jobId } = await enqueueBetJob({ userId, signal, options });
    return reply.code(202).send({ jobId });
  });

  app.get('/api/jobs/:jobId', async (request, reply) => {
    const paramsSchema = z.object({ jobId: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid job id' });
    }

    const { data, error } = await supabaseAdmin
      .from('bet_jobs')
      .select('*')
      .eq('id', parsed.data.jobId)
      .maybeSingle();

    if (error) {
      return reply.code(500).send({ error: error.message });
    }
    if (!data) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return data;
  });

  app.post('/api/odds', async (request, reply) => {
    const parsed = oddsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    try {
      const odds = await fetchJraOdds(parsed.data);
      return { odds };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(502).send({ error: message });
    }
  });
}
