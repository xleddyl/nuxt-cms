export function attachmentDisposition(filename: string) {
   const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_')
   const encoded = encodeURIComponent(filename).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
   )
   return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
