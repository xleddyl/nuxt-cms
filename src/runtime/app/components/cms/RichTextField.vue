<template>
   <div class="cms-richtext">
      <div class="cms-richtext-toolbar">
         <UButton
            v-for="action in actions"
            :key="action.icon"
            :icon="action.icon"
            size="xs"
            :variant="editor?.isActive(action.mark, action.attrs) ? 'soft' : 'ghost'"
            color="neutral"
            @click="action.run"
         />
         <span class="grow" />
         <UButton
            icon="i-lucide-undo-2"
            size="xs"
            variant="ghost"
            color="neutral"
            :disabled="!editor?.can().undo()"
            @click="undo"
         />
         <UButton
            icon="i-lucide-redo-2"
            size="xs"
            variant="ghost"
            color="neutral"
            :disabled="!editor?.can().redo()"
            @click="redo"
         />
      </div>
      <EditorContent :editor="editor" />
   </div>
</template>

<script setup lang="ts">
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { watch } from '#imports'

const model = defineModel<string | null>({ required: true })

const editor = useEditor({
   content: model.value ?? '',
   extensions: [StarterKit],
   editorProps: {
      attributes: { class: 'cms-richtext-body' },
   },
   onUpdate: ({ editor: instance }) => {
      model.value = instance.isEmpty ? null : instance.getHTML()
   },
})

watch(model, (value) => {
   if (!editor.value) return
   const current = editor.value.isEmpty ? null : editor.value.getHTML()
   if ((value ?? null) !== current) {
      editor.value.commands.setContent(value ?? '')
   }
})

const actions = [
   {
      icon: 'i-lucide-bold',
      mark: 'bold',
      run: () => {
         editor.value?.chain().focus().toggleBold().run()
      },
   },
   {
      icon: 'i-lucide-italic',
      mark: 'italic',
      run: () => {
         editor.value?.chain().focus().toggleItalic().run()
      },
   },
   {
      icon: 'i-lucide-strikethrough',
      mark: 'strike',
      run: () => {
         editor.value?.chain().focus().toggleStrike().run()
      },
   },
   {
      icon: 'i-lucide-heading-2',
      mark: 'heading',
      attrs: { level: 2 },
      run: () => {
         editor.value?.chain().focus().toggleHeading({ level: 2 }).run()
      },
   },
   {
      icon: 'i-lucide-heading-3',
      mark: 'heading',
      attrs: { level: 3 },
      run: () => {
         editor.value?.chain().focus().toggleHeading({ level: 3 }).run()
      },
   },
   {
      icon: 'i-lucide-list',
      mark: 'bulletList',
      run: () => {
         editor.value?.chain().focus().toggleBulletList().run()
      },
   },
   {
      icon: 'i-lucide-list-ordered',
      mark: 'orderedList',
      run: () => {
         editor.value?.chain().focus().toggleOrderedList().run()
      },
   },
   {
      icon: 'i-lucide-text-quote',
      mark: 'blockquote',
      run: () => {
         editor.value?.chain().focus().toggleBlockquote().run()
      },
   },
]

function undo() {
   editor.value?.chain().focus().undo().run()
}

function redo() {
   editor.value?.chain().focus().redo().run()
}
</script>
