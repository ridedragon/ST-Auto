<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>自动化运行脚本设置</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>

    <div class="inline-drawer-content">
      <div class="flex-container flexFlowColumn">
        <label class="checkbox_label" for="auto_runner_enabled">
          <input id="auto_runner_enabled" v-model="settings.enabled" type="checkbox" />
          <span>启用脚本 (核心功能)</span>
        </label>
      </div>

      <hr />

      <PromptEditor :entries="settings.promptEntries" @update:entries="updatePromptEntries" />

      <hr />

      <!-- 新的上下文正则编辑器 -->
      <div class="flex-container flexFlowColumn">
        <div><strong>上下文正则处理</strong></div>
        <p class="description">在将聊天记录发送给副AI之前，按顺序应用以下规则。</p>
        <div v-for="(rule, index) in settings.contextRegexRules" :key="rule.id" class="rule-item">
          <div class="rule-header">
            <input v-model="rule.enabled" type="checkbox" class="rule-toggle" />
            <input v-model="rule.name" type="text" class="text_pole rule-name" placeholder="规则名称" />
            <button class="menu_button" @click="removeRule('context', index)">删除</button>
          </div>
          <div class="rule-body">
            <textarea v-model="rule.find" class="text_pole" placeholder="查找 (支持 /.../flags 格式)"></textarea>
            <textarea v-model="rule.replace" class="text_pole" placeholder="替换为 (留空则为删除)"></textarea>
          </div>
        </div>
        <button class="menu_button wide-button" @click="addRule('context')">添加上下文规则</button>
      </div>

      <hr />

      <!-- 新的副AI输出正则编辑器 -->
      <div class="flex-container flexFlowColumn">
        <div><strong>副AI输出正则处理</strong></div>
        <p class="description">在收到副AI的回复后，按顺序应用以下规则。</p>
        <div v-for="(rule, index) in settings.subAiRegexRules" :key="rule.id" class="rule-item">
          <div class="rule-header">
            <input v-model="rule.enabled" type="checkbox" class="rule-toggle" />
            <input v-model="rule.name" type="text" class="text_pole rule-name" placeholder="规则名称" />
            <button class="menu_button" @click="removeRule('subAi', index)">删除</button>
          </div>
          <div class="rule-body">
            <textarea v-model="rule.find" class="text_pole" placeholder="查找 (支持 /.../flags 格式)"></textarea>
            <textarea v-model="rule.replace" class="text_pole" placeholder="替换为 (留空则为删除)"></textarea>
          </div>
        </div>
        <button class="menu_button wide-button" @click="addRule('subAi')">添加副AI输出规则</button>
      </div>

      <hr />

      <div class="flex-container flexFlowColumn">
        <div><strong>API 调用设置</strong></div>
        <label for="auto_runner_api_url">API 地址</label>
        <input
          id="auto_runner_api_url"
          v-model="settings.apiUrl"
          type="text"
          class="text_pole"
          placeholder="http://localhost:1234/v1"
        />

        <label for="auto_runner_api_key">API 密钥</label>
        <input
          id="auto_runner_api_key"
          v-model="settings.apiKey"
          type="password"
          class="text_pole"
          placeholder="留空表示无需密钥"
        />

        <div class="flex-container">
          <button class="menu_button wide-button" @click="getModels">获取模型</button>
        </div>
        <label for="auto_runner_model">模型</label>
        <select id="auto_runner_model" v-model="settings.model" class="text_pole">
          <option v-if="!settings.model" value="">请先获取模型</option>
          <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
        </select>

        <label for="auto_runner_temperature">Temperature: {{ settings.temperature }}</label>
        <input
          id="auto_runner_temperature"
          v-model.number="settings.temperature"
          type="range"
          step="0.1"
          min="0"
          max="2"
        />

        <label for="auto_runner_top_p">Top P: {{ settings.top_p }}</label>
        <input id="auto_runner_top_p" v-model.number="settings.top_p" type="range" step="0.05" min="0" max="1" />

        <label for="auto_runner_top_k">Top K: {{ settings.top_k }}</label>
        <input id="auto_runner_top_k" v-model.number="settings.top_k" type="range" step="1" min="0" max="100" />

        <label for="auto_runner_max_tokens">Max Tokens: {{ settings.max_tokens }}</label>
        <input
          id="auto_runner_max_tokens"
          v-model.number="settings.max_tokens"
          type="number"
          class="text_pole"
          min="1"
        />
      </div>

      <hr />

      <div class="flex-container flexFlowColumn">
        <div><strong>自动化设置</strong></div>
        <label for="auto_runner_total_replies">总回复次数</label>
        <input
          id="auto_runner_total_replies"
          v-model.number="settings.totalReplies"
          type="number"
          class="text_pole"
          min="1"
        />
        <label for="auto_runner_max_retries">最大重试次数</label>
        <input
          id="auto_runner_max_retries"
          v-model.number="settings.maxRetries"
          type="number"
          class="text_pole"
          min="0"
        />
        <label for="auto_runner_exemption_count">SSC及一键处理豁免次数</label>
        <input
          id="auto_runner_exemption_count"
          v-model.number="settings.exemptionCount"
          type="number"
          class="text_pole"
          min="0"
        />
        <label for="auto_runner_executed_count">自动执行次数计数</label>
        <div id="auto_runner_executed_count" class="text_pole">{{ settings.executedCount }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import _ from 'lodash';
import { SettingsSchema, RegexRuleSchema, type Settings } from './types';
import { start, stop } from './core';
import PromptEditor from './PromptEditor.vue';

const settings = ref<Settings>(SettingsSchema.parse({}));
const models = ref<string[]>([]);

// 加载设置
onMounted(async () => {
  try {
    const savedSettings = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    const defaultSettings = SettingsSchema.parse({});
    const mergedSettings = _.merge(defaultSettings, savedSettings);
    const parsedSettings = SettingsSchema.parse(mergedSettings);

    // 确保聊天记录占位符存在
    if (!parsedSettings.promptEntries.some(p => p.is_chat_history)) {
      parsedSettings.promptEntries.push({
        id: 'chat_history_placeholder',
        name: '聊天记录',
        content: '',
        enabled: true,
        editing: false,
        role: 'system',
        is_chat_history: true,
      });
    }

    settings.value = parsedSettings;

    if (settings.value.model) {
      models.value.push(settings.value.model);
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    settings.value = SettingsSchema.parse({});
  }
});

// 监视设置变化并自动保存
watch(
  settings,
  _.debounce(async newSettings => {
    try {
      const validatedSettings = SettingsSchema.parse(newSettings);
      await replaceVariables(_.cloneDeep(validatedSettings), { type: 'script', script_id: getScriptId() });
    } catch (e: any) {
      console.error('自动保存设置失败:', e);
    }
  }, 500), // 增加防抖，避免过于频繁的保存
  { deep: true },
);

const updatePromptEntries = (newEntries: any) => {
  settings.value.promptEntries = newEntries;
};

// 监视脚本启用/禁用状态
watch(
  () => settings.value.enabled,
  (newValue, oldValue) => {
    if (newValue === true && oldValue === false) {
      settings.value.executedCount = 0;
      start();
    } else if (newValue === false && oldValue === true) {
      stop();
    }
  },
);

// 添加新规则
const addRule = (type: 'context' | 'subAi') => {
  const newRule = RegexRuleSchema.parse({});
  if (type === 'context') {
    settings.value.contextRegexRules.push(newRule);
  } else {
    settings.value.subAiRegexRules.push(newRule);
  }
};

// 删除规则
const removeRule = (type: 'context' | 'subAi', index: number) => {
  if (type === 'context') {
    settings.value.contextRegexRules.splice(index, 1);
  } else {
    settings.value.subAiRegexRules.splice(index, 1);
  }
};

// 获取模型列表
const getModels = async () => {
  if (!settings.value.apiUrl) {
    toastr.error('请先填写API地址');
    return;
  }

  try {
    const response = await fetch(`${settings.value.apiUrl}/models`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const fetchedModels = data.data.map((model: any) => model.id);
    models.value = _.union(models.value, fetchedModels);
    toastr.success('模型列表已获取');
  } catch (error) {
    console.error('获取模型列表失败:', error);
    toastr.error('获取模型列表失败');
  }
};
</script>

<style lang="scss" scoped>
.wide-button {
  width: 100%;
  margin-top: 10px;
}

label {
  margin-top: 10px;
  margin-bottom: 5px;
  font-size: 0.9em;
  color: #ccc;
}

hr {
  border: none;
  border-top: 1px solid var(--bg2);
  margin: 20px 0;
}

input[type='range'] {
  width: 100%;
}

.description {
  font-size: 0.8em;
  color: #aaa;
  margin-bottom: 10px;
}

.rule-item {
  border: 1px solid var(--bg2);
  border-radius: 5px;
  padding: 10px;
  margin-bottom: 10px;
  background-color: var(--bg1-trans);
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.rule-toggle {
  transform: scale(1.2);
}

.rule-name {
  flex-grow: 1;
}

.rule-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

</style>
