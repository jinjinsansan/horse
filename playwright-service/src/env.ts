import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SERVICE_API_KEY: z.string().min(16),
  PORT: z.string().optional(),
  JOB_CONCURRENCY: z.string().optional(),
  PLAYWRIGHT_HEADLESS: z.string().optional(),
});

const parsed = schema.parse(process.env);

export const env = {
  supabaseUrl: parsed.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  serviceApiKey: parsed.SERVICE_API_KEY,
  port: Number(parsed.PORT ?? 4000),
  jobConcurrency: Number(parsed.JOB_CONCURRENCY ?? 1),
  headless: parsed.PLAYWRIGHT_HEADLESS !== 'false',
} as const;
