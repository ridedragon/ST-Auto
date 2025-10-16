import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

/**
 * 从酒馆变量中获取并验证设置
 * @returns {Settings | null} 返回解析后的设置对象，如果失败则返回 null
 */
export function getSettings(): Settings | null {
  try {
    const savedSettings = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    const defaultSettings = SettingsSchema.parse({});
    const mergedSettings = _.merge(defaultSettings, savedSettings);
    return SettingsSchema.parse(mergedSettings);
  } catch (error) {
    console.error('加载设置失败:', error);
    toastr.error('加载脚本设置失败，请检查配置。');
    return null;
  }
}
