<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { type Settings, saveSettings } from './settings';
import _ from 'lodash';

// Define props passed from panel.ts
const props = defineProps<{
  settings: Settings
}>();

// Create a local, reactive copy of the settings
const localSettings = ref<Settings>(_.cloneDeep(props.settings));
const models = ref<string[]>([]);
const isFetching = ref(false);

// Function to fetch available models from the API
async function fetchModels() {
  isFetching.value = true;
  toastr.info('正在获取模型列表...', '[AutoRunner]');
  try {
    // Assumes SillyTavern's global object is available to get completion providers
    const providers = SillyTavern.completion_providers;
    const modelList: string[] = [];
    for (const provider of providers) {
        if (provider.models) {
            modelList.push(...provider.models);
        }
    }
    models.value = _.uniq(modelList).sort();

    if (models.value.length > 0) {
        toastr.success('模型列表获取成功！', '[AutoRunner]');
    } else {
        toastr.warning('未找到可用模型。请检查您的SillyTavern API设置。', '[AutoRunner]');
    }
  } catch (error) {
    console.error('获取模型列表时出错:', error);
    toastr.error(`获取模型失败: ${(error as Error).message}`, '[AutoRunner] 错误');
  } finally {
    isFetching.value = false;
  }
}

// Watch for changes in localSettings and save them
watch(localSettings, (newSettings) => {
  saveSettings(newSettings);
}, { deep: true });

// Fetch models when the component is mounted
onMounted(() => {
  fetchModels();
});
</script>

<template>
  <div class="auto-runner-settings card">
    <div class="card-header">
      <h4 class="mb-0">Auto Runner 脚本设置</h4>
    </div>
    <div class="card-body">
      <div class="form-group">
        <label for="model">副AI模型</label>
        <div class="input-group">
          <select id="model" v-model="localSettings.selectedModel" class="form-control">
            <option disabled value="">{{ isFetching ? '加载中...' : '请选择一个模型' }}</option>
            <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
          </select>
          <div class="input-group-append">
            <button @click="fetchModels" class="btn btn-primary" :disabled="isFetching">
              {{ isFetching ? '正在获取...' : '刷新模型' }}
            </button>
          </div>
        </div>
        <small class="form-text text-muted">选择一个模型后，脚本将自动在每条消息后调用它。</small>
      </div>

      <div class="form-group">
        <label for="regex">内容处理正则表达式</label>
        <textarea id="regex" v-model="localSettings.regex" class="form-control" rows="8"></textarea>
        <small class="form-text text-muted">
          在将对话历史发送给副AI之前，将使用此正则表达式（全局、多行模式）清除每条消息的内容。
        </small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auto-runner-settings {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: .25rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card-header {
  background-color: #e9ecef;
  padding: .75rem 1.25rem;
  margin-bottom: 0;
  border-bottom: 1px solid #dee2e6;
}
.form-group {
  margin-bottom: 1rem;
}
.input-group {
  display: flex;
}
.form-control {
  flex-grow: 1;
}
.input-group-append {
  margin-left: -1px;
}
.btn {
    display: inline-block;
    font-weight: 400;
    color: #212529;
    text-align: center;
    vertical-align: middle;
    cursor: pointer;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    background-color: transparent;
    border: 1px solid transparent;
    padding: .375rem .75rem;
    font-size: 1rem;
    line-height: 1.5;
    border-radius: .25rem;
}
.btn-primary {
    color: #fff;
    background-color: #007bff;
    border-color: #007bff;
}
.btn:disabled {
    opacity: .65;
}
</style>
