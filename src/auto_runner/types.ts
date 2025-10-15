import { z } from 'zod';

export const SettingsSchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.preprocess((val) => val ?? '', z.string()),
  apiUrl: z.string().default(''),
  apiKey: z.string().default(''),
  model: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(1),
  top_k: z.number().min(0).default(40),
  maxReplies: z.number().min(1).default(10),
});

export type Settings = z.infer<typeof SettingsSchema>;
