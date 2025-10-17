<template>
  <div class="flex-container flexFlowColumn">
    <div><strong>提示词设置</strong> (总词符数: {{ totalTokens }})</div>
    <div v-for="(entry, index) in entries" :key="index" class="rule-item">
      <div class="rule-header">
        <input v-model="entry.enabled" type="checkbox" class="rule-toggle" />
        <input v-model="entry.name" type="text" class="text_pole rule-name" placeholder="条目名称" />
        <div class="buttons">
          <button class="menu_button icon-button" @click="toggleEdit(entry)">
            <i :class="['fa-solid', entry.editing ? 'fa-folder-open' : 'fa-folder']"></i>
          </button>
          <button class="menu_button icon-button" @click="saveEntries">
            <i class="fa-solid fa-save"></i>
          </button>
          <button class="menu_button icon-button" @click="removeEntry(index)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div v-if="entry.editing" class="rule-body">
        <textarea v-model="entry.content" class="text_pole" placeholder="提示词内容..."></textarea>
        <select v-model="entry.role" class="text_pole">
          <option>user</option>
          <option>system</option>
          <option>assistant</option>
        </select>
      </div>
    </div>
    <button class="menu_button wide-button" @click="addEntry">添加提示词条目</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import _ from 'lodash';
import { z } from 'zod';

const EntrySchema = z.object({
  name: z.string(),
  content: z.string(),
  enabled: z.boolean(),
  editing: z.boolean(),
  role: z.enum(['user', 'system', 'assistant']),
});

const EntriesSchema = z.array(EntrySchema);

type Entry = z.infer<typeof EntrySchema>;

const entries = ref<Entry[]>([]);

const SCRIPT_ID = 'auto_runner_prompts';

async function saveEntries() {
  try {
    const validatedEntries = EntriesSchema.parse(entries.value);
    await replaceVariables(_.cloneDeep(validatedEntries), { type: 'script', script_id: SCRIPT_ID });
    toastr.success('提示词已保存');
  } catch (e: any) {
    console.error('保存提示词条目失败:', e);
    toastr.error('保存提示词失败');
  }
}

onMounted(() => {
  try {
    const savedEntries = getVariables({ type: 'script', script_id: SCRIPT_ID }) || [];
    entries.value = EntriesSchema.parse(savedEntries);
  } catch (error) {
    console.error('加载提示词条目失败:', error);
    entries.value = [];
  }
});

const totalTokens = computed(() => {
  return entries.value.reduce((acc, entry) => {
    return acc + (entry.enabled ? entry.content.length : 0);
  }, 0);
});

function addEntry() {
  entries.value.push({
    name: '新条目',
    content: '',
    enabled: true,
    editing: true,
    role: 'user',
  });
}

function removeEntry(index: number) {
  entries.value.splice(index, 1);
}

function toggleEdit(entry: Entry) {
  entry.editing = !entry.editing;
}
</script>

<style lang="scss" scoped>
/* The styles are now inherited from the parent component (auto_runner/app.vue) */
/* We can add specific adjustments here if needed */
.rule-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rule-name {
  flex-grow: 1;
  min-width: 50px; /* Prevent it from becoming too small */
}

.buttons {
  display: flex;
  flex-shrink: 0; /* Prevent buttons from shrinking */
  gap: 5px;
}

.icon-button {
  padding: 4px 8px; /* Make buttons smaller */
  line-height: 1;
}

.rule-body select {
  margin-top: 5px;
}
</style>
