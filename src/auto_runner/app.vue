<template>
  <div class="auto-runner-settings">
    <h2>自动化运行脚本设置</h2>

    <div class="setting-group">
      <label class="toggle-switch">
        启用脚本
        <input type="checkbox" v-model="settings.enabled" />
        <span class="slider"></span>
      </label>
    </div>

    <div class="setting-group">
      <h3>提示词设置</h3>
      <textarea v-model="settings.prompt" placeholder="输入给副AI的指令..."></textarea>
    </div>

    <div class="setting-group">
      <h3>API 调用设置</h3>
      <input type="text" v-model="settings.apiUrl" placeholder="API URL" />
      <input type="password" v-model="settings.apiKey" placeholder="API 密钥" />
      <label>
        Temperature:
        <input type="number" v-model="settings.temperature" step="0.1" min="0" max="2" />
      </label>
    </div>

    <div class="setting-group">
      <h3>自动化设置</h3>
      <label>
        最大回复次数:
        <input type="number" v-model="settings.maxReplies" min="1" />
      </label>
    </div>

    <button @click="saveSettings">保存设置</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

const settings = ref<Settings>(SettingsSchema.parse({}));

// 2. 加载设置
onMounted(() => {
  try {
    const savedSettings = getVariables({ type: 'script', script_id: getScriptId() });
    settings.value = SettingsSchema.parse(savedSettings);
    toastr.info('设置已加载。');
  } catch (error) {
    console.error('加载设置失败:', error);
    // 如果解析失败，Zod 的 default() 会提供默认值
    settings.value = SettingsSchema.parse({});
    toastr.warning('无法加载保存的设置，已使用默认设置。');
  }
});

// 3. 保存设置
const saveSettings = () => {
  try {
    // 验证当前设置是否符合 schema
    const validatedSettings = SettingsSchema.parse(settings.value);
    replaceVariables(_.cloneDeep(validatedSettings), { type: 'script', script_id: getScriptId() });
    toastr.success('设置已成功保存！');
  } catch (e: any) {
    const error = e as Error;
    console.error('保存设置失败:', error);
    toastr.error(`保存失败: ${error.message}`);
  }
};
</script>

<style lang="scss" scoped>
.auto-runner-settings {
  padding: 1rem;
  background-color: #2a2a2e;
  color: #f0f0f0;
  border-radius: 8px;
  font-family: sans-serif;
}

h2,
h3 {
  color: #fff;
  border-bottom: 1px solid #444;
  padding-bottom: 0.5rem;
  margin-top: 1rem;
}

.setting-group {
  margin-bottom: 1rem;
}

input[type='text'],
input[type='password'],
input[type='number'],
textarea {
  width: 100%;
  padding: 0.5rem;
  background-color: #3a3a3e;
  border: 1px solid #555;
  color: #f0f0f0;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  box-sizing: border-box;
}

textarea {
  min-height: 100px;
  resize: vertical;
}

button {
  background-color: #4a90e2;
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s;

  &:hover {
    background-color: #357abd;
  }
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: 0.4s;
    border-radius: 34px;

    &:before {
      position: absolute;
      content: '';
      height: 26px;
      width: 26px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: 0.4s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: #4a90e2;
  }

  input:checked + .slider:before {
    transform: translateX(26px);
  }
}
</style>
