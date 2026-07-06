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
            :aria-label="t(action.label)"
            :title="t(action.label)"
            @click="action.run"
         />
         <UPopover v-model:open="linkOpen">
            <UButton
               icon="i-lucide-link"
               size="xs"
               :variant="editor?.isActive('link') ? 'soft' : 'ghost'"
               color="neutral"
               :aria-label="t('cms.richtext.link')"
               :title="t('cms.richtext.link')"
            />
            <template #content>
               <div class="flex items-center gap-2 p-2">
                  <UInput
                     v-model="linkUrl"
                     size="sm"
                     placeholder="https://"
                     class="w-64"
                     @keydown.enter.prevent="applyLink"
                  />
                  <UButton size="xs" :label="t('cms.richtext.setLink')" @click="applyLink" />
                  <UButton
                     v-if="editor?.isActive('link')"
                     size="xs"
                     variant="subtle"
                     color="error"
                     :label="t('cms.richtext.unsetLink')"
                     @click="removeLink"
                  />
               </div>
            </template>
         </UPopover>
         <span class="grow" />
         <UButton
            icon="i-lucide-undo-2"
            size="xs"
            variant="ghost"
            color="neutral"
            :aria-label="t('cms.richtext.undo')"
            :title="t('cms.richtext.undo')"
            :disabled="!editor?.can().undo()"
            @click="undo"
         />
         <UButton
            icon="i-lucide-redo-2"
            size="xs"
            variant="ghost"
            color="neutral"
            :aria-label="t('cms.richtext.redo')"
            :title="t('cms.richtext.redo')"
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
import { ref, useI18n, watch } from '#imports'

const model = defineModel<string | null>({ required: true })

const { t } = useI18n()

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
      icon: 'i-lucide-bold',
      mark: 'bold',
      label: 'cms.richtext.bold',
      run: () => {
         editor.value?.chain().focus().toggleBold().run()
      },
   },
   {
      icon: 'i-lucide-italic',
      mark: 'italic',
      label: 'cms.richtext.italic',
      run: () => {
         editor.value?.chain().focus().toggleItalic().run()
      },
   },
   {
      icon: 'i-lucide-strikethrough',
      mark: 'strike',
      label: 'cms.richtext.strike',
      run: () => {
         editor.value?.chain().focus().toggleStrike().run()
      },
   },
   {
      icon: 'i-lucide-heading-2',
      mark: 'heading',
      attrs: { level: 2 },
      label: 'cms.richtext.h2',
      run: () => {
         editor.value?.chain().focus().toggleHeading({ level: 2 }).run()
      },
   },
   {
      icon: 'i-lucide-heading-3',
      mark: 'heading',
      attrs: { level: 3 },
      label: 'cms.richtext.h3',
      run: () => {
         editor.value?.chain().focus().toggleHeading({ level: 3 }).run()
      },
   },
   {
      icon: 'i-lucide-list',
      mark: 'bulletList',
      label: 'cms.richtext.bulletList',
      run: () => {
         editor.value?.chain().focus().toggleBulletList().run()
      },
   },
   {
      icon: 'i-lucide-list-ordered',
      mark: 'orderedList',
      label: 'cms.richtext.orderedList',
      run: () => {
         editor.value?.chain().focus().toggleOrderedList().run()
      },
   },
   {
      icon: 'i-lucide-text-quote',
      mark: 'blockquote',
      label: 'cms.richtext.blockquote',
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
