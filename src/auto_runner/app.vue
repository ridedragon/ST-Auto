<template>
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>自动化运行脚本设置</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>

    <div class="inline-drawer-content">
      <div class="flex-container flexFlowColumn" style="padding-bottom: 0.5em">
        <label class="checkbox_label" for="auto_runner_enabled">
          <input id="auto_runner_enabled" v-model="settings.enabled" type="checkbox" />
          <span>启用脚本 (核心功能)</span>
        </label>
      </div>

      <div class="section-wrapper">
        <input type="checkbox" id="section-toggle-prompts" class="section-toggle-checkbox" />
        <label for="section-toggle-prompts" class="section-header">
          <strong>提示词配置集</strong>
          <i class="fa-solid fa-chevron-right"></i>
        </label>
        <div class="section-content">
          <div class="set-manager">
            <select v-model="settings.activePromptSetId" class="text_pole set-select">
              <option v-for="set in settings.promptSets" :key="set.id" :value="set.id">
                {{ set.name }}
              </option>
            </select>
            <div class="set-buttons">
              <button class="menu_button icon-button" title="新建配置" @click="addNewPromptSet">
                <i class="fa-solid fa-plus"></i>
              </button>
              <button class="menu_button icon-button" title="重命名当前配置" @click="renameActivePromptSet">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="menu_button icon-button danger" title="删除当前配置" @click="deleteActivePromptSet">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="set-manager" style="margin-top: 10px">
            <button class="menu_button wide-button" @click="importPromptSets">导入配置</button>
            <button class="menu_button wide-button" @click="exportActivePromptSet">导出当前配置</button>
          </div>
          <hr style="margin: 15px 0" />
          <PromptEditor :entries="activePromptSet.promptEntries" @update:entries="updateEntries" />
        </div>
      </div>

      <div class="section-wrapper">
        <input type="checkbox" id="section-toggle-context-regex" class="section-toggle-checkbox" />
        <label for="section-toggle-context-regex" class="section-header">
          <strong>上下文正则处理</strong>
          <i class="fa-solid fa-chevron-right"></i>
        </label>
        <div class="section-content">
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
      </div>

      <div class="section-wrapper">
        <input type="checkbox" id="section-toggle-subai-regex" class="section-toggle-checkbox" />
        <label for="section-toggle-subai-regex" class="section-header">
          <strong>副AI输出正则处理</strong>
          <i class="fa-solid fa-chevron-right"></i>
        </label>
        <div class="section-content">
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
      </div>

      <div class="section-wrapper">
        <input type="checkbox" id="section-toggle-api" class="section-toggle-checkbox" />
        <label for="section-toggle-api" class="section-header">
          <strong>API 调用设置</strong>
          <i class="fa-solid fa-chevron-right"></i>
        </label>
        <div class="section-content flex-container flexFlowColumn">
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
      </div>

      <div class="section-wrapper">
        <input type="checkbox" id="section-toggle-automation" class="section-toggle-checkbox" />
        <label for="section-toggle-automation" class="section-header">
          <strong>自动化设置</strong>
          <i class="fa-solid fa-chevron-right"></i>
        </label>
        <div class="section-content flex-container flexFlowColumn">
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
          <label class="checkbox_label" for="auto_runner_concise_notifications">
            <input id="auto_runner_concise_notifications" v-model="settings.conciseNotifications" type="checkbox" />
            <span>简洁通知模式</span>
          </label>
          <label for="auto_runner_executed_count">自动执行次数计数</label>
          <div id="auto_runner_executed_count" class="text_pole">{{ settings.executedCount }}</div>
          <button
            :disabled="!isCallingSubAI"
            :class="['menu_button', 'wide-button', { danger: isCallingSubAI }]"
            style="margin-top: 15px"
            @click="abortSubAICall"
            :title="isCallingSubAI ? '点击以中止请求' : '（无正在进行的请求）'"
          >
            <i class="fa-solid fa-stop"></i>
            {{ isCallingSubAI ? '中断副 AI' : '中断副 AI' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import _ from 'lodash';
import { RegexRuleSchema } from './types';
import {
  settings,
  activePromptSet,
  stopAutomation,
  addNewPromptSet,
  renameActivePromptSet,
  deleteActivePromptSet,
  importPromptSets,
  exportActivePromptSet,
  isCallingSubAI,
  abortSubAICall,
} from './core';
import PromptEditor from './PromptEditor.vue';
import type { PromptEntry } from './types';

const models = ref<string[]>([]);

// 监视脚本启用/禁用状态
watch(
  () => settings.value.enabled,
  (newValue, oldValue) => {
    if (newValue === false && oldValue === true) {
      // 如果脚本是从启用状态变为禁用状态，则停止任何正在运行的自动化
      stopAutomation();
    }
  },
);

// 当组件挂载时，如果已有模型，则显示
onMounted(() => {
  if (settings.value.model && !models.value.includes(settings.value.model)) {
    models.value.push(settings.value.model);
  }
});

// 更新提示词条目
const updateEntries = (newEntries: PromptEntry[]) => {
  if (activePromptSet.value) {
    const setToUpdate = settings.value.promptSets.find(p => p.id === activePromptSet.value.id);
    if (setToUpdate) {
      setToUpdate.promptEntries = newEntries;
    }
  }
};

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
.section-wrapper {
  border-top: 1px solid var(--bg2);

  &:first-of-type {
    border-top: none;
  }
  &:last-of-type {
    border-bottom: 1px solid var(--bg2);
    margin-bottom: 1em;
  }
}

.section-toggle-checkbox {
  display: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 0.25em 4px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--bg2-trans);
  }

  strong {
    font-size: 1.1em;
  }

  i {
    transition: transform 0.3s ease;
  }
}

.section-content {
  display: none;
  padding: 10px 4px 0;
}

.section-toggle-checkbox:checked + .section-header i {
  transform: rotate(90deg);
}

.section-toggle-checkbox:checked ~ .section-content {
  display: block;
}

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

.set-manager {
  display: flex;
  gap: 10px;
  align-items: center;
}

.set-select {
  flex-grow: 1;
}

.set-buttons {
  display: flex;
  gap: 5px;
}

.icon-button {
  padding: 6px 10px;
  line-height: 1;
  flex-shrink: 0;
}
</style>
