import type { Component } from 'vue'

export const cmsBlockComponents: Record<string, Component> = {
   NewsBodyText: { name: 'SectionText' },
   NewsBodyImage: { name: 'SectionImage' },
}

export const cmsPreviewComponents: Record<string, Component> = {
   news: { name: 'NewsArticle' },
}
