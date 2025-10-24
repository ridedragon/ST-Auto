<template>
  <div class="flex-container flexFlowColumn">
    <div><strong>提示词设置</strong> (总词符数: {{ totalTokens }})</div>
    <div
      v-for="(entry, index) in entries"
      :key="entry.id"
      :class="['rule-item', { 'chat-history-placeholder': entry.is_chat_history }]"
      draggable="true"
      @dragstart="dragStart(index)"
      @dragover.prevent
      @drop="drop(index)"
    >
      <div class="rule-header">
        <span class="drag-handle">☰</span>
        <input
          v-if="!entry.is_chat_history"
          v-model="entry.enabled"
          type="checkbox"
          class="rule-toggle"
          @change="update"
        />
        <input
          v-model="entry.name"
          type="text"
          class="text_pole rule-name"
          :readonly="entry.is_chat_history"
          placeholder="条目名称"
          @input="update"
        />
        <div class="buttons">
          <button v-if="!entry.is_chat_history" class="menu_button icon-button" @click="toggleEdit(entry)">
            <i :class="['fa-solid', entry.editing ? 'fa-folder-open' : 'fa-folder']"></i>
          </button>
          <button v-if="!entry.is_chat_history" class="menu_button icon-button" @click="removeEntry(index)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div v-if="entry.editing && !entry.is_chat_history" class="rule-body">
        <textarea v-model="entry.content" class="text_pole" placeholder="提示词内容..." @input="update"></textarea>
        <div class="attachments-section">
          <div class="attachment-list">
            <div
              v-for="(attachment, attIndex) in entry.attachments"
              :key="attachment.id"
              class="attachment-item"
              title="点击查看附件"
              @click.stop="showAttachment(attachment)"
            >
              <span class="attachment-name">{{ attachment.name }}</span>
              <button
                class="menu_button icon-button delete-attachment-btn"
                title="删除附件"
                @click.stop="removeAttachment(entry, attIndex)"
              >
                <i class="fa-solid fa-times"></i>
              </button>
            </div>
          </div>
          <button class="menu_button attachment-button" @click="triggerFileInput(entry)">添加附件</button>
        </div>
        <select v-model="entry.role" class="text_pole" @change="update">
          <option>user</option>
          <option>system</option>
          <option>assistant</option>
        </select>
      </div>
    </div>
    <button class="menu_button wide-button" @click="addEntry">添加提示词条目</button>
    <input
      ref="fileInputRef"
      type="file"
      multiple
      style="display: none"
      @change="handleFileUpload($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { PromptEntrySchema, type PromptEntry, AttachmentSchema, type Attachment } from './types';

const props = defineProps<{
  entries: PromptEntry[];
}>();

const emit = defineEmits(['update:entries']);

const fileInputRef = ref<HTMLInputElement | null>(null);

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

let currentEntryForFileUpload: PromptEntry | null = null;

function triggerFileInput(entry: PromptEntry) {
  currentEntryForFileUpload = entry;
  fileInputRef.value?.click();
}

async function handleFileUpload(event: Event) {
  if (!currentEntryForFileUpload) return;
  const entry = currentEntryForFileUpload;
  const input = event.target as HTMLInputElement;
  if (!input.files) return;

  const files = Array.from(input.files);
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = e => {
      const content = (e.target?.result as string).split(',')[1]; // Get base64 content
      if (content) {
        const newAttachment = AttachmentSchema.parse({
          name: file.name,
          type: file.type,
          content: content,
        });
        if (!entry.attachments) {
          entry.attachments = [];
        }
        entry.attachments.push(newAttachment);
        update();
      }
    };
    reader.readAsDataURL(file);
  }

  // Reset file input
  input.value = '';
}

function removeAttachment(entry: PromptEntry, index: number) {
  if (entry.attachments) {
    entry.attachments.splice(index, 1);
    update();
  }
}

function showAttachment(attachment: Attachment) {
  const { name, type, content } = attachment;
  const context = (window.parent as any).SillyTavern.getContext();

  if (type.startsWith('image/')) {
    const imageUrl = `data:${type};base64,${content}`;
    const imageHtml = `<div style="text-align: center;"><img src="${imageUrl}" style="max-width: 100%; max-height: 70vh; border-radius: 8px;"></div>`;
    context.callGenericPopup(imageHtml, '查看图片', name, { okButton: '关闭', wide: true });
  } else if (type.startsWith('text/')) {
    try {
      const textContent = atob(content);
      const textHtml = `<textarea class="text_pole" rows="20" style="width: 100%;" readonly>${textContent}</textarea>`;
      context.callGenericPopup(textHtml, '查看文本', name, { okButton: '关闭', wide: true });
    } catch (e) {
      console.error('解码附件内容时出错:', e);
      toastr.error('无法解码文本文件内容。');
    }
  } else {
    toastr.info(`不支持预览文件类型 "${type}"。`);
  }
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

.attachments-section {
  margin-top: 10px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 5px;
}

.attachment-item {
  background-color: var(--bg2);
  padding: 2px 8px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9em;
  max-width: 100%; /* Ensure the item itself doesn't overflow its container */
  overflow: hidden; /* Hide anything that might still overflow */
  cursor: pointer;
  transition: background-color 0.2s;
}

.attachment-item:hover {
  background-color: var(--bg3);
}

.attachment-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  min-width: 0; /* Important for flexbox to allow shrinking */
}

.delete-attachment-btn {
  flex-shrink: 0; /* Prevent the delete button from shrinking */
}

.attachment-button {
  white-space: nowrap;
}

.delete-attachment-btn i {
  color: #ff5555;
}

.delete-attachment-btn:hover i {
  color: #ff8888;
}

.wide-button {
  width: 100%;
  margin-top: 10px;
}

.chat-history-placeholder {
  background-color: var(--bg3) !important;
}
</style>
