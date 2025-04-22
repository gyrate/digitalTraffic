import axios from 'axios'

/**
 * 通用的获取MOCK数据方法
 * @param name {String} 文件名
 * @param options {object} 配置参数
 * @returns {Promise}
 */
export function fetchMockData (name, options) {
    if (!name) {
      console.error('缺少模拟数据JOSN文件名')
      return
    }
    return new Promise((resolve) => {
      const ext = /json/.test(name) ? '' : '.json'
      axios.get(`${import.meta.env.BASE_URL}static/mock/${name}${ext}`).then(res => {
        resolve(res.data)
      })
    })
  }