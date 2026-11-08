import "dotenv/config";
import { z } from "zod";

const trimmedEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
);

const envSchema = z.object({
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(4100),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  // The IP clients should use in ICE candidates — the VM's public IP, not its private one.
  ANNOUNCED_IP: z.string().min(1),
  // Single shared UDP+TCP port for all WebRTC media (see mediasoupConfig.ts) — avoids
  // needing a wide firewall port range, at the cost of needing this one port open.
  MEDIA_PORT: z.coerce.number().default(44444),
});

export const env = envSchema.parse(trimmedEnv);
