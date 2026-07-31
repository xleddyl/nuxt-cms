export function useRuntimeConfig(): never {
   throw new Error('useRuntimeConfig is not available in unit tests')
}

function ref<T>(value: T) {
   return { value }
}

function computed<T>(getter: () => T) {
   return {
      get value() {
         return getter()
      },
   }
}

export function useAsyncData<T>(key: string, handler: () => Promise<T>) {
   const data = ref<T | null>(null)
   const error = ref<Error | undefined>(undefined)
   const status = ref<'idle' | 'pending' | 'success' | 'error'>('pending')

   const settled = handler()
      .then((value) => {
         data.value = value
         status.value = 'success'
      })
      .catch((cause: Error) => {
         error.value = cause
         status.value = 'error'
      })

   const asyncData = {
      key,
      data,
      error,
      status,
      pending: computed(() => status.value === 'pending'),
      refresh: async () => {
         data.value = await handler()
      },
      execute: async () => {
         data.value = await handler()
      },
      clear: () => {
         data.value = null
      },
   }

   return {
      ...asyncData,
      then: (onFulfilled: (value: typeof asyncData) => unknown) =>
         settled.then(() => onFulfilled(asyncData)),
   }
}
