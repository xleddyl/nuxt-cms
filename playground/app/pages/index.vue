<template>
   <div class="cms-scope cms-canvas cms-grain min-h-screen">
      <div class="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10 sm:py-14">
         <section class="cms-rise" style="animation-delay: 60ms">
            <h1 class="cms-display max-w-3xl text-4xl font-bold text-balance sm:text-6xl">
               {{ data?.homepage?.heroTitle ?? 'Content, served from your own server' }}
            </h1>

            <p class="mt-4 max-w-xl text-base text-(--ui-text-muted) sm:text-lg">
               {{
                  data?.homepage?.heroSubtitle ??
                  'Everything on this page is fetched from the CMS GraphQL endpoint.'
               }}
            </p>
            <p v-if="data?.homepage?.launchDate" class="cms-kicker mt-6">
               launching {{ formatDate(data.homepage.launchDate) }}
            </p>
         </section>

         <section
            class="cms-rise mt-14 flex flex-wrap items-center gap-x-10 gap-y-4 border-y border-(--cms-line) py-5"
            style="animation-delay: 120ms"
         >
            <div v-for="stat in stats" :key="stat.label" class="flex items-baseline gap-2.5">
               <span class="cms-display text-2xl font-semibold text-(--ui-text-highlighted)">
                  {{ stat.value }}
               </span>
               <span class="cms-kicker">{{ stat.label }}</span>
            </div>
            <NuxtLink
               to="/cms"
               class="ml-auto inline-flex items-center gap-2 rounded-full border border-(--cms-line-strong) px-4 py-1.5 text-sm font-medium text-(--ui-text-highlighted) transition-colors hover:bg-(--ui-bg-elevated)"
            >
               <CmsIcon name="cog-6-tooth" class="size-4" />
               Open admin
            </NuxtLink>
         </section>

         <section class="mt-14 flex-1">
            <h2 class="cms-kicker cms-rise" style="animation-delay: 180ms">upcoming events</h2>

            <div
               v-if="!data?.events.length"
               class="cms-empty cms-rise mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center"
               style="animation-delay: 220ms"
            >
               <CmsIcon name="calendar" class="size-6 text-(--ui-text-dimmed)" />
               <p class="text-sm text-(--ui-text-muted)">
                  No published events yet — create one in the admin and it will show up here.
               </p>
            </div>

            <div v-else class="mt-6 grid gap-5 sm:grid-cols-2">
               <article
                  v-for="(event, index) in data.events"
                  :key="event.id"
                  class="cms-card cms-rise group flex flex-col overflow-hidden"
                  :class="{ 'sm:col-span-2 sm:flex-row': event.featured }"
                  :style="{ animationDelay: `${220 + index * 70}ms` }"
               >
                  <div
                     class="relative aspect-[5/2] shrink-0 overflow-hidden bg-(--cms-sage)"
                     :class="event.featured ? 'sm:aspect-auto sm:w-2/5' : ''"
                  >
                     <img
                        v-if="event.poster?.url"
                        :src="event.poster.url"
                        :alt="event.poster.alt ?? event.title"
                        class="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                     />
                     <span
                        v-else
                        class="cms-display absolute inset-0 flex items-center justify-center text-5xl font-bold text-(--cms-fern) opacity-30"
                     >
                        {{ event.title.slice(0, 1).toUpperCase() }}
                     </span>
                     <span
                        v-if="event.featured"
                        class="cms-badge is-published absolute top-3 left-3 bg-(--cms-surface)"
                     >
                        featured
                     </span>
                  </div>

                  <div class="flex flex-1 flex-col gap-3 p-5">
                     <div class="flex items-center justify-between gap-3">
                        <time :datetime="event.date" class="cms-kicker text-(--cms-fern)">
                           {{ formatDate(event.date) }}
                        </time>
                        <span v-if="event.seats != null" class="cms-kicker">
                           {{ event.seats }} seats
                        </span>
                     </div>
                     <h3
                        class="cms-display text-xl font-semibold text-(--ui-text-highlighted)"
                        :class="{ 'sm:text-2xl': event.featured }"
                     >
                        {{ event.title }}
                     </h3>
                     <p
                        v-if="excerpt(event.description)"
                        class="line-clamp-2 text-sm text-(--ui-text-muted)"
                     >
                        {{ excerpt(event.description) }}
                     </p>
                     <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                        <span v-if="event.category" class="cms-pill is-active">
                           {{ event.category.name }}
                        </span>
                        <span v-for="tag in event.tags" :key="tag.id" class="cms-pill">
                           {{ tag.name }}
                        </span>
                     </div>
                  </div>
               </article>
            </div>
         </section>
      </div>
   </div>
</template>

<script setup lang="ts">
const { data } = useCms(`{
   homepage { heroTitle heroSubtitle launchDate }
   events(sort: [{ field: date }]) {
      id
      title
      date
      seats
      featured
      description
      poster { url alt }
      category { id name }
      tags { id name }
   }
   eventsCount
   categories { id }
   tags { id }
}`)

const stats = computed(() => [
   { value: data.value?.eventsCount ?? 0, label: 'events' },
   { value: data.value?.categories.length ?? 0, label: 'categories' },
   { value: data.value?.tags.length ?? 0, label: 'tags' },
])

function formatDate(date: string) {
   return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
   })
}

function excerpt(html: string | null) {
   return (
      html
         ?.replace(/<[^>]+>/g, ' ')
         .replace(/\s+/g, ' ')
         .trim() ?? ''
   )
}
</script>
