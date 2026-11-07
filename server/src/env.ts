import "dotenv/config";
import { z } from "zod";

// Dashboard env-var UIs (Render, Vercel, ...) can silently append a trailing
// newline when a value is saved; trim every string before validating so a
// stray \n doesn't turn into an invalid HTTP header value downstream.
const trimmedEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
});

export const env = envSchema.parse(trimmedEnv);
