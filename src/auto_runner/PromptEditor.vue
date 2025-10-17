<template>
  <div class="flex-container flexFlowColumn">
    <div><strong>提示词设置</strong> (总词符数: {{ totalTokens }})</div>
    <div
      v-for="(entry, index) in entries"
      :key="entry.id"
      class="rule-item"
      draggable="true"
      @dragstart="dragStart(index)"
      @dragover.prevent
      @drop="drop(index)"
    >
      <div class="rule-header">
        <span class="drag-handle">☰</span>
        <input v-model="entry.enabled" type="checkbox" class="rule-toggle" @change="update" />
        <input v-model="entry.name" type="text" class="text_pole rule-name" placeholder="条目名称" @input="update" />
        <div class="buttons">
          <button class="menu_button icon-button" @click="toggleEdit(entry)">
            <i :class="['fa-solid', entry.editing ? 'fa-folder-open' : 'fa-folder']"></i>
          </button>
          <button class="menu_button icon-button" @click="removeEntry(index)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div v-if="entry.editing" class="rule-body">
        <textarea v-model="entry.content" class="text_pole" placeholder="提示词内容..." @input="update"></textarea>
        <select v-model="entry.role" class="text_pole" @change="update">
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
import { computed } from 'vue';
import { PromptEntrySchema, type PromptEntry } from './types';

const props = defineProps<{
  entries: PromptEntry[];
}>();

const emit = defineEmits(['update:entries']);

const totalTokens = computed(() => {
  return props.entries.reduce((acc, entry) => {
    return acc + (entry.enabled ? entry.content.length : 0);
  }, 0);
});

function update() {
  emit('update:entries', props.entries);
}

function addEntry() {
  const newEntry = PromptEntrySchema.parse({
    name: '新条目',
    content: '',
    enabled: true,
    editing: true,
    role: 'user',
  });
  const newEntries = [...props.entries, newEntry];
  emit('update:entries', newEntries);
}

function removeEntry(index: number) {
  const newEntries = [...props.entries];
  newEntries.splice(index, 1);
  emit('update:entries', newEntries);
}

function toggleEdit(entry: PromptEntry) {
  entry.editing = !entry.editing;
  update();
}

// Drag and Drop
let draggedIndex = -1;

function dragStart(index: number) {
  draggedIndex = index;
}

function drop(targetIndex: number) {
  if (draggedIndex === -1 || draggedIndex === targetIndex) {
    return;
  }
  const newEntries = [...props.entries];
  const [draggedItem] = newEntries.splice(draggedIndex, 1);
  newEntries.splice(targetIndex, 0, draggedItem);
  draggedIndex = -1;
  emit('update:entries', newEntries);
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

.drag-handle {
  cursor: grab;
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

.wide-button {
  width: 100%;
  margin-top: 10px;
}
</style>
