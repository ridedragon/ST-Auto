import { z } from 'zod';
import _ from 'lodash';

// 用户提供的默认正则表达式组合
const defaultRegex = [
  '<StatusPlaceHolderImpl\\/>',
  '\\s*<!--[\\s\\S]*?-->\\s*',
  '(<disclaimer>.*?<\\/disclaimer>)',
  '(<guifan>.*?<\\/guifan>)',
  '```start',
  '<content>',
  '<\\/content>',
  '```end',
  '<done>',
  '`<done>`',
  '(<!--\\s*consider\\s*:[\\s\\S]*?-->)',
  '(.*?<\\/think(ing)?>(\\n)?)',
  '(<think(ing)?>[\\s\\S]*?<\\/think(ing)?>(\\n)?)',
  '<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>',
].join('|');


export const SettingsSchema = z.object({
  selectedModel: z.string().default(''),
  regex: z.string().default(defaultRegex),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function getSettings(): Settings {
  const saved = getVariables({ type: 'script', script_id: getScriptId() });
  // 使用 safeParse 来避免因数据格式错误导致整个脚本崩溃
  const result = SettingsSchema.safeParse(saved ?? {});
  if (result.success) {
    return result.data;
  } else {
    console.error('Failed to parse settings, using default settings.', result.error);
    return SettingsSchema.parse({});
  }
}

export function saveSettings(settings: Settings) {
  replaceVariables(_.cloneDeep(settings), { type: 'script', script_id: getScriptId() });
}
