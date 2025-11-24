import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { registerRoutes } from './routes.js';

async function bootstrap() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: false });

  app.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions?.url === '/health') {
      return;
    }
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || apiKey !== env.serviceApiKey) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  await registerRoutes(app);

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    console.log(`[playwright-service] listening on port ${env.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

bootstrap();
