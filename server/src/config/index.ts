import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root folder first
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
// Fallback to local server directory env
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/cloud-ide'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters long"),
  JWT_REFRESH_SECRET: z.string().min(8, "JWT_REFRESH_SECRET must be at least 8 characters long"),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('==================================================');
  console.error('❌ Environment configuration validation failed:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  console.error('==================================================');
  process.exit(1);
}

export const config = parsed.data;
