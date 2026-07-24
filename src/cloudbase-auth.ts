import cloudbase from '@cloudbase/js-sdk'

const env = import.meta.env.VITE_CLOUDBASE_ENV_ID
const region = import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai'
const accessKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY
const useLocalAdminApi = import.meta.env.DEV && import.meta.env.MODE === 'local-admin'

export const cloudbaseApp = !useLocalAdminApi && env && accessKey
  ? cloudbase.init({ accessKey, auth: { detectSessionInUrl: true }, env, region })
  : null
export const cloudbaseAuth = cloudbaseApp?.auth || null

export async function callAdminFunction<T>(action: string, payload: Record<string, unknown>) {
  if (!cloudbaseApp) throw new Error('CloudBase 登录配置缺失')
  const result = await cloudbaseApp.callFunction({ data: { action, payload }, name: 'adminApi' })
  const response = result.result as { ok?: boolean; data?: T; message?: string }
  if (!response?.ok) throw new Error(response?.message || '后台接口返回失败')
  return response.data as T
}

export async function signInAdmin(username: string, password: string) {
  if (!cloudbaseAuth) throw new Error('CloudBase 登录配置缺失')
  const { data, error } = await cloudbaseAuth.signInWithPassword({ password, username })
  if (error || !data?.session) throw new Error(error?.message || '登录失败')
  return data.session
}

export async function getAdminSession() {
  if (!cloudbaseAuth) return null
  const { data, error } = await cloudbaseAuth.getSession()
  if (error) throw new Error(error.message)
  const session = data?.session
  if (!session || session.user?.is_anonymous) return null
  return session
}
