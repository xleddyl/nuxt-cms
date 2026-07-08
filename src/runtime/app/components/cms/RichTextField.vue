<template>
   <div class="cms-richtext">
      <div class="cms-richtext-toolbar">
         <CmsButton
            v-for="action in actions"
            :key="action.icon"
            :icon="action.icon"
            size="xs"
            :variant="editor?.isActive(action.mark, action.attrs) ? 'soft' : 'ghost'"
            color="neutral"
            :aria-label="action.label"
            :title="action.label"
            @click="action.run"
         />
         <CmsPopover v-model:open="linkOpen">
            <CmsButton
               icon="link"
               size="xs"
               :variant="editor?.isActive('link') ? 'soft' : 'ghost'"
               color="neutral"
               aria-label="Link"
               title="Link"
            />
            <template #content>
               <div class="flex items-center gap-2 p-2">
                  <CmsInput
                     v-model="linkUrl"
                     size="sm"
                     placeholder="https://"
                     class="w-64"
                     @keydown.enter.prevent="applyLink"
                  />
                  <CmsButton size="xs" label="Apply" @click="applyLink" />
                  <CmsButton
                     v-if="editor?.isActive('link')"
                     size="xs"
                     variant="subtle"
                     color="error"
                     label="Remove link"
                     @click="removeLink"
                  />
               </div>
            </template>
         </CmsPopover>
         <span class="grow" />
         <CmsButton
            icon="arrow-uturn-left"
            size="xs"
            variant="ghost"
            color="neutral"
            aria-label="Undo"
            title="Undo"
            :disabled="!editor?.can().undo()"
            @click="undo"
         />
         <CmsButton
            icon="arrow-uturn-right"
            size="xs"
            variant="ghost"
            color="neutral"
            aria-label="Redo"
            title="Redo"
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
import { ref, watch } from '#imports'

const model = defineModel<string | null>({ required: true })

const editor = useEditor({
   content: model.value ?? '',
   extensions: [StarterKit.configure({ link: { openOnClick: false } })],
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
      icon: 'bold',
      mark: 'bold',
      label: 'Bold',
      run: () => {
         editor.value?.chain().focus().toggleBold().run()
      },
   },
   {
      icon: 'italic',
      mark: 'italic',
      label: 'Italic',
      run: () => {
         editor.value?.chain().focus().toggleItalic().run()
      },
   },
   {
      icon: 'strikethrough',
      mark: 'strike',
      label: 'Strikethrough',
      run: () => {
         editor.value?.chain().focus().toggleStrike().run()
      },
   },
   {
      icon: 'h2',
      mark: 'heading',
      attrs: { level: 2 },
      label: 'Heading 2',
      run: () => {
         editor.value?.chain().focus().toggleHeading({ level: 2 }).run()
      },
   },
   {
      icon: 'h3',
      mark: 'heading',
      attrs: { level: 3 },
      label: 'Heading 3',
      run: () => {
         editor.value?.chain().focus().toggleHeading({ level: 3 }).run()
      },
   },
   {
      icon: 'list-bullet',
      mark: 'bulletList',
      label: 'Bullet list',
      run: () => {
         editor.value?.chain().focus().toggleBulletList().run()
      },
   },
   {
      icon: 'numbered-list',
      mark: 'orderedList',
      label: 'Numbered list',
      run: () => {
         editor.value?.chain().focus().toggleOrderedList().run()
      },
   },
   {
      icon: 'chat-bubble-bottom-center-text',
      mark: 'blockquote',
      label: 'Quote',
      run: () => {
         editor.value?.chain().focus().toggleBlockquote().run()
      },
   },
]

const linkOpen = ref(false)
const linkUrl = ref('')

watch(linkOpen, (open) => {
   if (open) linkUrl.value = (editor.value?.getAttributes('link').href as string | undefined) ?? ''
})

function applyLink() {
   const url = linkUrl.value.trim()
   const chain = editor.value?.chain().focus().extendMarkRange('link')
   if (url) chain?.setLink({ href: url }).run()
   else chain?.unsetLink().run()
   linkOpen.value = false
}

function removeLink() {
   editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
   linkOpen.value = false
}

function undo() {
   editor.value?.chain().focus().undo().run()
}

function redo() {
   editor.value?.chain().focus().redo().run()
}
</script>
