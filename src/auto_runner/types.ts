import { z } from 'zod';

export const SettingsSchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.string().default(''),
  apiUrl: z.string().default(''),
  apiKey: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.7),
  maxReplies: z.number().min(1).default(10),
});

export type Settings = z.infer<typeof SettingsSchema>;
