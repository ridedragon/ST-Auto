import { z } from 'zod';

export const SettingsSchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.preprocess(val => val ?? '', z.string()),
  apiUrl: z.preprocess(val => val ?? '', z.string()),
  apiKey: z.preprocess(val => val ?? '', z.string()),
  model: z.preprocess(val => val ?? '', z.string()),
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(1),
  top_k: z.number().min(0).default(40),
  max_tokens: z.coerce.number().min(1).default(1024),
  totalReplies: z.coerce.number().min(1).default(10),
  executedCount: z.coerce.number().min(0).default(0),
  regex: z.string().default(
    String.raw`<StatusPlaceHolderImpl\/>
\s*<!--[\s\S]*?-->\s*
(<disclaimer>.*?<\/disclaimer>)|(<guifan>.*?<\/guifan>)|
\`\`\`start|<content>|<\/content>|\`\`\`end|<done>|\`<done>\`|
(<!--\s*consider\s*:\s*(.*?)\s*-->)|(.*?<\/think(ing)?>(\n)?)|(<think(ing)?>[\s\S]*?<\/think(ing)?>(\n)?)
/<UpdateVariable>[\s\S]*?</UpdateVariable>/gm`,
  ),
  subAiRegex: z.preprocess(val => val || String.raw`^.*?<\/think(ing)?>\s*`, z.string()),
  subAiRegexReplacement: z.preprocess(val => val ?? '', z.string()),
  maxRetries: z.coerce.number().min(0).default(3),
  exemptionCount: z.coerce.number().min(0).default(0),
});

export type Settings = z.infer<typeof SettingsSchema>;
