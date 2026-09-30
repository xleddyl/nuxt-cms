export type CmsUserRole = 'superadmin' | 'admin'

export interface CmsSessionUser {
   id?: string
   email: string
   name?: string | null
   role?: CmsUserRole
   firstLogin?: boolean
   passwordStamp?: string
}

export interface CmsAccount {
   id: string
   email: string
   name: string | null
   role: CmsUserRole
   lastLoginAt: string | null
   createdAt: string
}

export const MIN_PASSWORD_LENGTH = 8
