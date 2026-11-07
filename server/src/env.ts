import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
});

export const env = envSchema.parse(process.env);
