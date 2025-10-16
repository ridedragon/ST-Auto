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
                    <span>启用脚本</span>
                </label>
            </div>

            <hr />

            <div class="flex-container flexFlowColumn">
                <div><strong>提示词设置</strong></div>
                <textarea v-model="settings.prompt" class="text_pole" placeholder="输入给副AI的指令..."></textarea>
            </div>

            <hr />

            <div class="flex-container flexFlowColumn">
                <div><strong>上下文正则处理</strong></div>
                <textarea v-model="settings.regex" class="text_pole" placeholder="输入正则表达式..."></textarea>
            </div>

            <hr />

            <div class="flex-container flexFlowColumn">
                <div><strong>副AI输出正则处理</strong></div>
                <textarea v-model="settings.subAiRegex" class="text_pole" placeholder="输入正则表达式..."></textarea>
                <textarea v-model="settings.subAiRegexReplacement" class="text_pole" placeholder="输入替换内容..."></textarea>
            </div>

            <hr />

            <div class="flex-container flexFlowColumn">
                <div><strong>API 调用设置</strong></div>
                <label for="auto_runner_api_url">API 地址</label>
                <input id="auto_runner_api_url" v-model="settings.apiUrl" type="text" class="text_pole" placeholder="http://localhost:1234/v1" />

                <label for="auto_runner_api_key">API 密钥</label>
                <input id="auto_runner_api_key" v-model="settings.apiKey" type="password" class="text_pole" placeholder="留空表示无需密钥" />

                <div class="flex-container">
                    <button class="menu_button wide-button" @click="getModels">获取模型</button>
                </div>
                <label for="auto_runner_model">模型</label>
                <select id="auto_runner_model" v-model="settings.model" class="text_pole">
                    <option v-if="!settings.model" value="">请先获取模型</option>
                    <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
                </select>

                <label for="auto_runner_temperature">Temperature: {{ settings.temperature }}</label>
                <input id="auto_runner_temperature" v-model.number="settings.temperature" type="range" step="0.1" min="0" max="2" />

                <label for="auto_runner_top_p">Top P: {{ settings.top_p }}</label>
                <input id="auto_runner_top_p" v-model.number="settings.top_p" type="range" step="0.05" min="0" max="1" />

                <label for="auto_runner_top_k">Top K: {{ settings.top_k }}</label>
                <input id="auto_runner_top_k" v-model.number="settings.top_k" type="range" step="1" min="0" max="100" />

                <label for="auto_runner_max_tokens">Max Tokens: {{ settings.max_tokens }}</label>
                <input id="auto_runner_max_tokens" v-model.number="settings.max_tokens" type="number" class="text_pole" min="1" />
            </div>

            <hr />

            <div class="flex-container flexFlowColumn">
                <div><strong>自动化设置</strong></div>
                <label for="auto_runner_total_replies">总回复次数</label>
                <input id="auto_runner_total_replies" v-model.number="settings.totalReplies" type="number" class="text_pole" min="1" />
                <label>自动执行次数</label>
                <div class="text_pole">{{ settings.totalReplies - settings.remainingReplies }}/{{ settings.totalReplies }}</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import _ from 'lodash';
import { SettingsSchema, type Settings } from './types';

const settings = ref<Settings>(SettingsSchema.parse({}));
const models = ref<string[]>([]);

// 加载设置
onMounted(async() => {
  try {
    const savedSettings = getVariables({ type: 'script', script_id: getScriptId() });
    settings.value = SettingsSchema.parse(savedSettings);
    if (settings.value.model) {
      models.value.push(settings.value.model);
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    settings.value = SettingsSchema.parse({});
  }
});

// 监视设置变化并自动保存
watch(settings, (newSettings) => {
  try {
    const validatedSettings = SettingsSchema.parse(newSettings);
    replaceVariables(_.cloneDeep(validatedSettings), { type: 'script', script_id: getScriptId() });
  } catch (e: any) {
    const error = e as Error;
    console.error('自动保存设置失败:', error);
  }
}, { deep: true });


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
        // 根据常见的 API 响应格式，模型列表在 data.data 中
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
  margin: 15px 0;
}

input[type='range'] {
  width: 100%;
}
</style>
