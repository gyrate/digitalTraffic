let mainMap = null
const AMAP_KEY = '8281b6b8f40890205d2a2755b52dbfee'//私人账号
const AMAP_WEB_KEY = '7b442da06473f0bc978d0f8317fc35cd' //私人账号


// 默认开启WebGL
// window.forceWebGL = true

const pluginsList = [
  'AMap.PolyEditor',
  'AMap.CustomLayer',
  'AMap.ControlBar',
  'AMap.Heatmap',
  'Map3D',
  'AMap.GLCustomLayer',
  'AMap.Buildings',
  'AMap.Size',
  'AMap.LngLat',
  'AMap.3DTilesLayer',
  'AMap.PolyEditor',
  'AMap.PolylineEditor'
]

/**
 * 获取地图
 */
export function getMap () {
  return mainMap
}

/**
 * 删除地图
 */
export function destoryMap () {
  if (mainMap) {
    mainMap.clearMap()
    mainMap.destroy()
  }
}

/**
 * 初始化地图
 * @param {Object} conf 地图配置
 * @return {AMap.Map} map 地图实例
 */
export function initMap ({
  dom,
  zoom = 11,
  zooms = [3, 22],
  viewMode = '3D',
  rotation = 0,
  pitch = 30,
  center = [113.533339, 22.794258],
  mapStyle,
  mask,
  skyColor,
  showBuildingBlock = true
} = {}) {
  return new Promise((resolve, reject) => {
    loadFile()
      .then(() => {
        const container = dom || 'container'
        const map = new AMap.Map(container, {
          center,
          resizeEnable: true,
          zooms,
          viewMode,
          defaultCursor: 'default',
          pitch,
          mapStyle: mapStyle || 'amap://styles/grey',
          expandZoomRange: true,
          rotation,
          zoom,
          skyColor,
          showBuildingBlock: false, // 不显示默认建筑物
          features: ['bg', 'road', 'point'], // 不显示默认建筑物
          layers: [
            AMap.createDefaultLayer(),
            new AMap.Buildings({
              zooms: [10, 22],
              zIndex: 2,
              // heightFactor: 1.2, // 修改该值会导致显示异常
              roofColor: 'rgba(171,211,234,0.9)',
              wallColor: 'rgba(34,64,169,0.5)',
              opacity: 0.7,
              visible: showBuildingBlock
            })
          ],
          mask: mask || null
        })
        mainMap = map
        window.mainMap = map
        resolve(map)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

/**
 * 加载地图文件
 */
export function loadFile () {
  return new Promise((resolve, reject) => {
    if (window.AMap && window.Loca) {
      resolve()
    } else {
      // 加载maps.js
      const url = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&callback=_mapLoaded&plugin=${pluginsList.join(
        ','
      )}`
      const jsapi = document.createElement('script')
      jsapi.charset = 'utf-8'
      jsapi.src = url
      document.head.appendChild(jsapi)
      jsapi.onerror = function () {
        reject(new Error('地图API文件加载失败'))
      }
    }

    // 加载loca.js
    window._mapLoaded = function () {
      const arr = [
        `https://webapi.amap.com/loca?v=2.0.0beta&key=${AMAP_KEY}`
        // `${location.protocol}//webapi.amap.com/ui/1.1/main-async.js`
      ]
      let count = 0

      for (let i = 0; i < arr.length; i++) {
        const jsapi = document.createElement('script')
        jsapi.charset = 'utf-8'
        jsapi.src = arr[i]
        document.head.appendChild(jsapi)
        jsapi.onload = function () {
          count++
          if (count >= arr.length) {
            resolve()
          }
        }
        jsapi.onerror = function () {
          reject(new Error('地图可视化API文件加载失败'))
        }
      }
    }
  })
}

/**
 * 路径规划功能
 * @param {Array|Object} start 起点坐标，格式为 [lng, lat] 或 AMap.LngLat 对象
 * @param {Array|Object} end 终点坐标，格式为 [lng, lat] 或 AMap.LngLat 对象
 * @returns {Promise} 返回包含路径数据和坐标点的Promise
 */
export async function getNavRoute(start, end) {
  
  // 处理起点和终点坐标
  let startLngLat, endLngLat
  
  // 处理起点坐标
  if (Array.isArray(start)) {
    startLngLat = start.join(',')
  } else if (start.lng && start.lat) {
    startLngLat = `${start.lng},${start.lat}`
  } else {
    throw new Error('起点坐标格式不正确')
  }
  
  // 处理终点坐标
  if (Array.isArray(end)) {
    endLngLat = end.join(',')
  } else if (end.lng && end.lat) {
    endLngLat = `${end.lng},${end.lat}`
  } else {
    throw new Error('终点坐标格式不正确')
  }
  
  try {
    // 构建API请求URL
    let url = `https://restapi.amap.com/v5/direction/driving?key=${AMAP_WEB_KEY}&origin=${startLngLat}&destination=${endLngLat}&show_fields=cost,navi,polyline,tmcs`

    // 发起请求
    const response = await fetch(url)
    const data = await response.json()
    
    // 检查API返回状态
    if (data.status === '1' && data.route && data.route.paths && data.route.paths.length > 0) {
      // 获取第一条路径
      const path = data.route.paths[0]
      
      // 解析路径坐标
      const pathCoordinates = []
      
      // 遍历所有步骤
      path.steps.forEach(step => {
        // 解析每个步骤的坐标点
        if (step.polyline) {
          const points = step.polyline.split(';')
          points.forEach(point => {
            const [lng, lat] = point.split(',')
            pathCoordinates.push([parseFloat(lng), parseFloat(lat)])
          })
        }
      })
      
      // 返回路径数据和坐标点
      return {
        success: true,
        data: data,
        path: path,
        coordinates: pathCoordinates,
        distance: path.distance,
        duration: path.duration
      }
    } else {
      return {
        success: false,
        message: data.info || '路径规划失败',
        data: data
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '路径规划请求出错',
      error: error
    }
  }
}

export default getMap()
