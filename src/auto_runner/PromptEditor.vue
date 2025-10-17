<template>
  <div class="p-4 font-sans">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold">提示词</h1>
      <div class="flex items-center space-x-2">
        <span>总词符数: {{ totalTokens }}</span>
        <button @click="addEntry" class="rounded p-1 hover:bg-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <div v-for="(entry, index) in entries" :key="index" class="rounded-lg border p-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="cursor-pointer">☰</span>
            <input type="text" v-model="entry.name" class="bg-transparent focus:outline-none">
          </div>
          <div class="flex items-center space-x-2">
            <span v-if="!entry.editing">{{ entry.content.length }}</span>
            <button @click="toggleEdit(entry)" class="rounded p-1 hover:bg-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.829-2.828z" />
              </svg>
            </button>
            <label class="switch">
              <input type="checkbox" v-model="entry.enabled">
              <span class="slider round"></span>
            </label>
            <button @click="removeEntry(index)" class="rounded p-1 hover:bg-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        <div v-if="entry.editing" class="mt-2">
          <textarea v-model="entry.content" class="w-full rounded-md border p-2" rows="4"></textarea>
          <div class="mt-2 flex items-center justify-end space-x-2">
            <select v-model="entry.role" class="rounded-md border p-1">
              <option>user</option>
              <option>system</option>
              <option>assistant</option>
            </select>
          </div>
        </div>
      </div>
    </div>
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
.switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
}

.switch input {
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
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
}

input:checked + .slider {
  background-color: #2196F3;
}

input:focus + .slider {
  box-shadow: 0 0 1px #2196F3;
}

input:checked + .slider:before {
  transform: translateX(14px);
}

.slider.round {
  border-radius: 20px;
}

.slider.round:before {
  border-radius: 50%;
}
</style>
