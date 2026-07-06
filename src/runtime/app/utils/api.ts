interface CmsApiOptions {
   method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
   body?: unknown
   query?: Record<string, unknown>
}

export function cmsApi<T = unknown>(url: string, options?: CmsApiOptions): Promise<T> {
   return ($fetch as (url: string, options?: CmsApiOptions) => Promise<T>)(url, options)
}
