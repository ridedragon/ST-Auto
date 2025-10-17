<template>
  <div class="flex-container flexFlowColumn">
    <div><strong>提示词设置</strong> (总词符数: {{ totalTokens }})</div>
    <div v-for="(entry, index) in entries" :key="index" class="rule-item">
      <div class="rule-header">
        <input v-model="entry.enabled" type="checkbox" class="rule-toggle" />
        <input v-model="entry.name" type="text" class="text_pole rule-name" placeholder="条目名称" />
        <button class="menu_button" @click="toggleEdit(entry)">{{ entry.editing ? '完成' : '编辑' }}</button>
        <button class="menu_button" @click="removeEntry(index)">删除</button>
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

onMounted(() => {
  try {
    const savedEntries = getVariables({ type: 'script', script_id: SCRIPT_ID }) || [];
    entries.value = EntriesSchema.parse(savedEntries);
  } catch (error) {
    console.error('加载提示词条目失败:', error);
    entries.value = [];
  }
});

watch(
  entries,
  _.debounce(async (newEntries) => {
    try {
      const validatedEntries = EntriesSchema.parse(newEntries);
      await replaceVariables(_.cloneDeep(validatedEntries), { type: 'script', script_id: SCRIPT_ID });
    } catch (e: any) {
      console.error('自动保存提示词条目失败:', e);
    }
  }, 500),
  { deep: true }
);

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
.rule-body select {
  margin-top: 5px;
}
</style>
