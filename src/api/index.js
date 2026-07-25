import axios from 'axios'
import { getToken } from '@/utils/token'
import { getAuthExpiredReason, handleAuthExpired, isAuthExpiredPayload } from '@/utils/authSession'

const apiBaseURL = import.meta.env.PROD
  ? import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_PROXY || ''
  : ''

// 创建 axios 实例
const request = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

console.info('[H5][API] client initialized:', {
  baseURL: apiBaseURL || '(same-origin)',
  mode: import.meta.env.MODE
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 在发送请求之前做些什么
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    // 对请求错误做些什么
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  async (response) => {
    // 对响应数据做点什么
    const { data } = response
    console.log('响应数据:', data)
    
    // 如果返回的状态码不是 200，说明接口出错
    if (data.code !== 200) {
      if (isAuthExpiredPayload(data) && getToken()) {
        await handleAuthExpired({
          source: 'http-response',
          reason: getAuthExpiredReason(data)
        })
      }
      // 可以在这里统一处理错误
      console.error('接口错误:', data.msg)
      return Promise.reject(new Error(data.msg))
    }
    
    return data
  },
  async (error) => {
    // 对响应错误做点什么
    const { response } = error
    console.error('[H5][API] request failed:', {
      url: error.config?.url || '',
      method: error.config?.method || '',
      status: response?.status || null,
      message: error.message || ''
    })
    console.log('响应错误:', response)

    const token = getToken()
    if (
      token
      && (
        response?.status === 401
        || isAuthExpiredPayload(response?.data)
        || isAuthExpiredPayload(error.message)
      )
    ) {
      await handleAuthExpired({
        source: 'http-error',
        reason: getAuthExpiredReason(response?.data || error.message)
      })
    }
    
    return Promise.reject({
      code: response?.status || 0,
      msg: response?.statusText || error.message || 'Network request failed'
    })
  }
)

// 封装 GET 请求
export const get = (url, params = {}) => {
  return request.get(url, { params })
}

// 封装 POST 请求
export const post = (url, data = {}) => {
  return request.post(url, data)
}

// 封装 PUT 请求
export const put = (url, data = {}) => {
  return request.put(url, data)
}

// 封装 DELETE 请求
export const del = (url, params = {}) => {
  return request.delete(url, { params })
}

// 导出 axios 实例
export default request
