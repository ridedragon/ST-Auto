<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>Auto Runner</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <label>
        <input v-model="settings.enabled" type="checkbox" />
        启用脚本
      </label>
      <hr />
      <textarea v-model="settings.prompt" placeholder="输入给副AI的指令..."></textarea>
      <hr />
      <input v-model="settings.apiUrl" type="text" placeholder="API URL" />
      <input v-model="settings.apiKey" type="password" placeholder="API 密钥" />
      <br />
      <button @click="fetchModels">获取模型</button>
      <select v-model="settings.model">
        <option v-for="model in settings.models" :key="model" :value="model">{{ model }}</option>
      </select>
      <hr />
      <label>
        Temperature:
        <input v-model="settings.temperature" type="number" step="0.1" min="0" max="2" />
      </label>
      <br />
      <label>
        Top P:
        <input v-model="settings.top_p" type="number" step="0.1" min="0" max="1" />
      </label>
      <br />
      <label>
        Top K:
        <input v-model="settings.top_k" type="number" min="0" />
      </label>
      <hr />
      <label>
        最大回复次数:
        <input v-model="settings.maxReplies" type="number" min="1" />
      </label>
      <hr />
      <button @click="saveSettings">保存设置</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

const settings = ref<Settings>(SettingsSchema.parse({}));

const fetchModels = async () => {
  if (!settings.value.apiUrl) {
    toastr.error('请先填写 API URL');
    return;
  }
  try {
    const response = await fetch(`${settings.value.apiUrl}/v1/models`, {
      headers: {
        Authorization: `Bearer ${settings.value.apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const models = data.data.map((model: any) => model.id);
    settings.value.models = models;
    if (models.length > 0 && !settings.value.model) {
      settings.value.model = models[0];
    }
    toastr.success('模型列表已获取');
  } catch (error) {
    console.error('获取模型列表失败:', error);
    toastr.error('获取模型列表失败');
  }
};

onMounted(() => {
  try {
    const savedSettings = getVariables({ type: 'script', script_id: getScriptId() });
    settings.value = SettingsSchema.parse(savedSettings);
    toastr.info('设置已加载。');
    if (settings.value.apiUrl && settings.value.models.length === 0) {
      fetchModels();
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    settings.value = SettingsSchema.parse({});
    toastr.warning('无法加载保存的设置，已使用默认设置。');
  }
});

const saveSettings = () => {
  try {
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
.inline-drawer-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
input,
textarea,
select,
button {
  width: 100%;
  box-sizing: border-box;
}
textarea {
  min-height: 80px;
}
</style>
