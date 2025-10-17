import { z } from 'zod';

// 定义单条正则表达式规则的结构
export const RegexRuleSchema = z.object({
  id: z.string().default(() => `rule_${Date.now()}_${Math.random()}`),
  name: z.string().default(''),
  find: z.string().default(''),
  replace: z.string().default(''),
  enabled: z.boolean().default(true),
});

export type RegexRule = z.infer<typeof RegexRuleSchema>;

export const SettingsSchema = z.object({
  enabled: z.boolean().default(false),
  apiUrl: z.preprocess(val => val ?? '', z.string()),
  apiKey: z.preprocess(val => val ?? '', z.string()),
  model: z.preprocess(val => val ?? '', z.string()),
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(1),
  top_k: z.number().min(0).default(40),
  max_tokens: z.coerce.number().min(1).default(1024),
  totalReplies: z.coerce.number().min(1).default(10),
  executedCount: z.coerce.number().min(0).default(0),
  
  // 新的正则表达式规则数组
  contextRegexRules: z.array(RegexRuleSchema).default([
    { id: 'default_1', name: '移除 StatusPlaceHolderImpl', find: '/<StatusPlaceHolderImpl\\/>/g', replace: '', enabled: true },
    { id: 'default_2', name: '移除 HTML 注释', find: '/\\s*<!--[\\s\\S]*?-->\\s*/g', replace: '', enabled: true },
    { id: 'default_3', name: '移除 think 标签之前的内容', find: '/^[\\s\\S]*?<\\/think(ing)?>\\n?/', replace: '', enabled: true },
    { id: 'default_4', name: '移除 UpdateVariable 标签', find: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm', replace: '', enabled: true },
  ]),
  subAiRegexRules: z.array(RegexRuleSchema).default([]),

  maxRetries: z.coerce.number().min(0).default(3),
  exemptionCount: z.coerce.number().min(0).default(0),
});

export type Settings = z.infer<typeof SettingsSchema>;
