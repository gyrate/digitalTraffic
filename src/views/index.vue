<script setup>
import { getMap, initMap, getNavRoute } from '@/utils/mainMap2.js'
import { fetchMockData } from '@/utils/mock.js'
import GLlayer from '#/gl-layers/lib/index.mjs'
import * as THREE from 'three' 
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// import * as dat from 'dat.gui'
import {wgs84togcj02, gcj02towgs84} from '../utils/lngLat.js'

const { 
  FlowlineLayer,
  PathLayer,
  DrivingLayer,
  TilesLayer,
  LayerManager
} = GLlayer

// 高德可视化类
let loca

// 容器
const container = ref(null)

// 图层管理
const layerManger = new LayerManager()

// 是否第一人称
let isFirstView = false

// 交通事件类型图标
var ACCIDENT_ICONS = {
    201: './static/icons/accident/traffic-control.png',
    202: './static/icons/accident/jam.png',
    203: './static/icons/accident/construction.png',
    204: './static/icons/accident/close.png',
    205: './static/icons/accident/fog.png',
    0: './static/icons/accident/accident.png',
};

const allLayers = [ 
  { id: 'navPathLayer', name: '规划路线图层', visible: true },
  { id: 'accidentLayer', name: '交通事件', visible: false },
  { id: 'stopLayer', name: '公共交通', visible: false },
  { id: 'cameraLayer', name: '交通摄像机', visible: false },
  { id: 'trafficLayer', name: '交通情况', visible: false },
  { id: 'drivingLayer', name: '车辆行驶', visible: true },
  { id: 'buildingLayer', name: '建筑图层', visible: true },
  { id: 'wxLayer', name: '影像底层', visible: false },
]

const SETTING = {
  // 地图中心点
  center: [114.214033,22.318893], 
  // 各图层是否独立存在, 为true时, 图层之间不会相互影响
  alone: false, 
}

let startMarker
let endMarker
// 缓存所有主干道路数据
let routeData
// 缓存公交站点数据
let busStopData

// 缓存规划路径数据
let pathData

// 地图数据提示浮窗
var normalMarker
var infoWindow

onMounted(async () => {
  await init() 
  initDragPoints()
  await initLayers()
  animateFn()
  // initGUI()
})

//销毁前清除所有图层
onBeforeUnmount(() => {
  layerManger.clear()
})

var wxLayer

// 初始化地图
async function init() {

  const map = await initMap({
    viewMode: '3D',
    dom: container.value,
    showBuildingBlock: false,
    center: SETTING.center,
    zoom: 15.5,
    pitch: 42.0,
    rotation: 4.9,
    mapStyle: 'amap://styles/light',
    skyColor: '#c8edff'
  })

  // 添加卫星地图
  // const satelliteLayer = new AMap.TileLayer.Satellite();
  // map.add([satelliteLayer]);

  map.on('zoomend', (e) => {
    console.log(map.getZoom())
  })
  map.on('click', (e) => {
    const { lng, lat } = e.lnglat
    console.log([lng, lat])

    if (normalMarker) {
      map.remove(normalMarker)
    }

    // 定位3dtiles位置
    // layerManger.findLayerById('buildingLayer').setCenter([lng, lat])    
  })

  loca = new Loca.Container({
    map,
  });

  normalMarker = new AMap.Marker({
    offset: [70, -15],
    zooms: [1, 22]
  });

  infoWindow = new AMap.InfoWindow({
    // offset: new AMap.Pixel(-15, -30),
    isCustom: true,
    closeWhenClickMap: true
  });

  document.addEventListener('keydown', function (event) {
    var keyCode = event.keyCode;
    // 判断是否按下了数字键1、2、3
    if (keyCode === 49) { 
      switchTopic('product')
    } else if (keyCode === 50) {
      switchTopic('security')
    } else if (keyCode === 51) {
      switchTopic('value')
    }
  });
}

window.getMapView = function () {
  const center = mainMap.getCenter()
  const zoom = mainMap.getZoom()
  const pitch = mainMap.getPitch()
  const rotation = mainMap.getRotation()

  const res = {
    center,
    zoom,
    pitch,
    rotation
  }
  console.log(res)
  return res
}
window.setMapView = function ({ center, zoom, pitch, rotation }) {
  mainMap.setCenter(center)
  mainMap.setZoom(zoom)
  mainMap.setPitch(pitch)
  mainMap.setRotation(rotation)
}

async function initLayers() {
  initWxLayer()
  await initBuildingLayer()
  await initVehicleLayer()
  await initCameraLayer()
  await initTrafficLayer()
  await initBusStopLayer()
  await initAccidentLayer()

  // 导航路线图层
  await initNavPathLayer()

  // 有个bug，在生成规划路径前先移动一下, 会导致共享数据的图层错位
  // PathLayer 似乎会影响customCoords.lngLatsToCoords
  await generateRoute()
}

//在地图上创建两个可拖动的点
function initDragPoints(){
  const map = getMap()

  startMarker = new AMap.Marker({
    position: [114.20415, 22.323125],
    draggable: true,
    icon: new AMap.Icon({
      size: new AMap.Size(20, 60),
      image: `./static/icons/ico-point1.svg`,
    }),
    label:{
      content: '起点',
      direction: 'top-center',
    },
    anchor: 'bottom-center' // 设置锚点
  })
  
  endMarker = new AMap.Marker({
    position: [114.212801, 22.316262], // 稍微调整第二个点的位置，避免重叠
    draggable: true,
    icon: new AMap.Icon({
      size: new AMap.Size(20, 60),
      image: `./static/icons/ico-point2.svg`,
    }),
    label:{
      content: '终点',
      direction: 'top',
    },
    anchor: 'bottom-center' // 设置锚点
  })
  map.add([startMarker, endMarker])


}

/**
 * 初始化卫星影像图层
 * 天地图
 */
 async function initWxLayer() {
    // 天地图, 企业认证
    const layer = new AMap.TileLayer.WMTS({
        url: 'https://t4.tianditu.gov.cn/img_w/wmts',
        blend: false,
        tileSize: 256,
        params: {
            Layer: 'img',
            Version: '1.0.0',
            Format: 'tiles',
            TileMatrixSet: 'w',
            STYLE: 'default',
            // 免费申请 TOKEN
            // https://console.tianditu.gov.cn/api/key
            tk: 'bb0abf278c1e848823bd136f7d11ca58'            
        },
        visible: true
    });

    layer.setMap(getMap());

    layer.id = 'wxLayer'
    layerManger.add(layer);

    wxLayer = layer
}

async function initNavPathLayer() {
  const map = getMap()
  const pathLayer = new PathLayer({
      id: 'navPathLayer',
      map,
      data: {features: []},
      styles: {
        0: { lineWidth: 2, color: '#00FF00', label: '畅通' },
        1: { lineWidth: 2, color: '#FFFF00', label: '缓行' },
        2: { lineWidth: 2, color: '#FFA500', label: '拥堵' },
        3: { lineWidth: 2, color: '#FF0000', label: '严重拥堵' },
        4: { lineWidth: 2, color: '#ffffff', label: '未知' }
      },
      getStyle: (feature) => {
        return feature.properties.status
      },
      altitude: 5, // 设置高度，避免与地面重叠
      zooms: [3, 22],
      interact: true,
      alone: SETTING.alone
    })

    // 添加到图层管理器
    layerManger.add(pathLayer) 
}

// 添加交通事件图层初始化函数
async function initAccidentLayer() {
  const map = getMap()
  
  // 获取交通事件数据
  const { data } = await fetchMockData('hk-accident.json')
  
  // 转换数据为GeoJSON格式
  const features = data.map(item => {
    const { brief,x,y,eventDesc,eventType,lines,startTime, roadName} = item
    return {
      type: 'Feature',
      properties: {        
        brief,
        eventDesc,
        eventType,
        lines,
        startTime,
        roadName
      },
      geometry: {
        type: 'Point',
        coordinates: [x, y]      // 直接使用几何坐标
      }
    } 
  })
  
  const geo = new Loca.GeoJSONSource({
    data: {
      type: 'FeatureCollection',
      features
    }
  })

  const layer = new Loca.IconLayer({
    zooms: [10, 20],
    zIndex: 300,
    opacity: 1,
    visible: getLayerInitVisible('accidentLayer'),
  })
  
  layer.setSource(geo)
  layer.setStyle({
    icon: (index, feature) => {
      const {eventType} = feature.properties
      return ACCIDENT_ICONS[eventType] || ACCIDENT_ICONS[0]
    },
    iconSize: [30, 30],
    anchor: 'center',
    // 文本配置
    label: {
      content: (index, feat) => feat.properties.description,
      direction: 'top',
      style: {
        fontSize: 12,
        fillColor: '#fff',
        strokeColor: '#000',
        strokeWidth: 2
      }
    }
  })

  map.on('click', (e) => {
    const feat = layer.queryFeature(e.pixel.toArray());
    if (feat) {
      const {brief, eventType, lines, startTime, roadName} = feat.properties
      infoWindow.setContent(
        `<div class="amap-info-window">
          <p>road: ${roadName}</p>
          <p>startTime: ${startTime}</p> 
          <p>desc: ${brief}</p>          
        </div>`
      )
      infoWindow.setOffset(new AMap.Pixel(0, -30));
      infoWindow.open(map, e.lnglat);
    }
  });
  
  loca.add(layer)
  layer.id = 'accidentLayer'
  layerManger.add(layer)
  
}

/**
 * 初始化公交站点图层
 */
async function initBusStopLayer(){
  const map = getMap()
  const data1 = await fetchMockData('hk-bus-stops.geojson')
  const data2 = await fetchMockData('hk-gmb-stops.geojson')
  const data3 = await fetchMockData('hk-tram-stops.geojson')

  data1.features = data1.features.map((item) => {
    item.properties.type = 'bus'
    return item
  })
  data2.features = data2.features.map((item) => {
    item.properties.type = 'gmb'
    return item
  })
  data3.features = data3.features.map((item) => {
    item.properties.type = 'tram'
    return item 
  })
  busStopData = new Loca.GeoJSONSource({ 
    data: {
      type: 'FeatureCollection',
      features: data1.features
                .concat(data2.features) 
                .concat(data3.features) 
    } 
  });

  const layer = new Loca.IconLayer({
    zooms: [10, 22],
    zIndex: 300,
    opacity: 1,
    visible: getLayerInitVisible('stopLayer'),
  })
  
  layer.setSource(busStopData)
  layer.setStyle({
    icon:(index, feature)=>{
      return `./static/icons/transit/${feature.properties.type}.png`
    },
    // unit : 'meter',
    iconSize: [20, 20],
    anchor: 'center'
  })

  loca.add(layer)
  layer.id = 'stopLayer'
  layerManger.add(layer)

  // 点击事件
  map.on('click', async (e) => {
    const feat = layer.queryFeature(e.pixel.toArray());
    if (feat) {
      // 更换为服务端接口
      const res = await fetchMockData('hk-gmb-stops-detail.json')

      const busStopList = res.data.bus_stop.map(item => {
        return `<div class="bus-line">
          <p>路线: ${item.orig_sc} → ${item.dest_sc}</p>
          <p>下一站: ${item.next_station_sc} ${item.eta}分钟</p>
        </div>`
      }).join('')

      infoWindow.setContent(
        `<div class="amap-info-window">
          <div class="bus-list">
          ${busStopList}  
          </div>
        </div>`
      )
      infoWindow.setOffset(new AMap.Pixel(0, -30));
      infoWindow.open(map, e.lnglat);
      
    } 
  })
}

/**
 * 过滤公交站点图层
 * @param type 
 */
function filterStopLayer(type){
  // const map = getMap()
  const layer = layerManger.findLayerById('stopLayer')
  const featues = busStopData.options.data.features 
  // 根据type筛选features
  const filteredFeatures = type === 'all' 
    ? featues
    : featues.filter(feature => feature.properties.type === type)
  
  // 更新图层数据
  layer.setSource(new Loca.GeoJSONSource({
    data: {
      type: 'FeatureCollection',
      features: filteredFeatures
    }
  }))
}

function getLayerInitVisible(layerId) {
  return allLayers.find(layer => layer.id === layerId)?.visible ?? true
}

/**
 * 交通摄像头POI图层
 */
async function initCameraLayer() {
  const map = getMap()
  const data = await fetchMockData('hk-traffic-cameras.geojson')

  const geo = new Loca.GeoJSONSource({ data });

  var labelsLayer = new Loca.LabelsLayer({
    zooms: [10, 20],
    collision: false, // 关闭避让，让元素看上去比较多
    visible: getLayerInitVisible('cameraLayer'),
  })
  labelsLayer.setSource(geo);
  labelsLayer.setStyle({
    icon: {
      type: 'image',
      image: `./static/icons/ico-camera.png`,
      size: [30, 30],
      anchor: 'bottom-center',
    },
    extData: (index, feat) => {
      return feat.properties;
    }
  });
  loca.add(labelsLayer)

  labelsLayer.id = 'cameraLayer'
  layerManger.add(labelsLayer)

  labelsLayer.on('complete', () => {
    var labelMarkers = labelsLayer.getLabelsLayer().getAllOverlays();
    for (let marker of labelMarkers) {
      
      marker.on('click', (e) => {
        var position = e.data.data && e.data.data.position;
        const { description, url, district } = marker.getExtData()
        if (position) {          
          infoWindow.setContent(
            `<div class="amap-info-window">
              <div class="img-wrap"><img src=${url} /></div>
              <p>desc: ${description}</p>
              <p>district: ${district}</p>
            </div>`
          );
          infoWindow.setOffset(new AMap.Pixel(0, -30));
          infoWindow.open(map, position);
        }
      });

      marker.on('mouseover', (e) => {
        var position = e.data.data && e.data.data.position;
        const { description} = marker.getExtData()
        if (position) {
          normalMarker.setContent(
            `<div class="amap-info-tip">
              <p>${description} </p>
            </div>`,
          );
          normalMarker.setOffset(new AMap.Pixel(0, -30))
          normalMarker.setPosition(position);
          map.add(normalMarker);
        }
      });
      marker.on('mouseout', () => {
        map.remove(normalMarker);
      });
    }
  });

}

/**
 * 初始化巡航图层
 */
async function initVehicleLayer() {
  const map = getMap()
  const data = await fetchMockData('vehicle-wander.geojson')
  const NPC = await getModle()

  const layer = new DrivingLayer({
    id: 'drivingLayer',
    map,
    zooms: [4, 30],
    path: data,
    altitude: 5,
    speed: 40.0,
    NPC,
    alone: SETTING.alone,
    visible: getLayerInitVisible('drivingLayer'),
  })
  layer.on('complete', ({ scene }) => {

    // 调整模型的亮度
    const aLight = new THREE.AmbientLight(0xffffff, 3.5)
    scene.add(aLight)

    layer.resume()
  })
  layerManger.add(layer)

  // 移动路径图层
  const movePathLayer = new FlowlineLayer({
    id: 'movePathLayer',
    map,
    zooms: [10, 22],
    data,
    speed: 0.5,
    lineWidth: 10,
    altitude: 0,
    alone: SETTING.alone,
  })
  // movePathLayer.on('complete', ({ scene }) => {
  //   movePathLayer.hide()
  // })
  layerManger.add(movePathLayer)
}

function animateFn() {
  requestAnimationFrame(animateFn);
}

// 加载模型
function getModle() {
  return new Promise((resolve) => {

    const loader = new GLTFLoader()
    loader.load('./static/model/vehicle/car1.gltf', (gltf) => {

      const model = gltf.scene.children[0]
      const size = 2.0
      model.scale.set(size, size, size)

      resolve(model)
    })

  })
}

/**
 * 初始化建筑图层
 */
async function initBuildingLayer() {
  const map = getMap()

  const layer = new TilesLayer({
    id: 'buildingLayer',
    title: '城市3D建筑图层',
    alone: SETTING.alone,
    map,
    // center: [114.207803, 22.319947], //重新调校后的中心
    center: [114.224455, 22.310166], //重新调校后的中心
    zooms: [4, 30],
    interact: false,
    // tilesURL: 'http://localhost:9003/model/tQqeT8LGm/tileset0.json', // HK 
    tilesURL: './static/3dtiles/guantang/tileset0.json', // local
    // altitude: 5,
    needShadow: true,
    visible: getLayerInitVisible('buildingLayer')
  })
  layerManger.add(layer)

  layer.on('complete', ({ scene, renderer }) => {
    // 调整模型的亮度
    const aLight = new THREE.AmbientLight(0xffffff, 1.0)
    scene.add(aLight)

    // 添加侧面打光
    const sideLight = new THREE.DirectionalLight(0xffffff, 2.5)
    sideLight.position.set(-1000, 1000, 1000)
    scene.add(sideLight)
  })

}

// 初始化交通图层
async function initTrafficLayer() {
  const map = getMap()
  routeData = await fetchMockData('hk-centerline-kml-match.geojson')
  //给道路车速默认值
  routeData.features.forEach(item=>{    
    item.properties.speed = 60.0
  })
  
  const layer = new PathLayer({
    id: 'trafficLayer',
    map,
    data: routeData,
    styles: {
      0:{lineWidth:2, color: '#ff0000', label: '< 10'}, 
      1:{lineWidth:2, color: '#ffa500', label: '>=10'},
      2:{lineWidth:2, color: '#ffff00', label: '>=30'},
      3:{lineWidth:2, color: '#00ff00', label: '>=40'},
    },
    getStyle:(feature)=>{
      const {speed} = feature.properties
      if(speed>=40){
        return 3
      }else if(speed>=30){
        return 2
      }else if(speed>=10){
        return 1
      }else{
        return 0
      }
    },
    altitude: 10,
    zooms: [10, 22],
    interact: true,
    alone: SETTING.alone,
    visible: getLayerInitVisible('trafficLayer'),
  })
  
  layerManger.add(layer)

  setTimeout(()=>{
    updateTrafficLayer()
  }, 5000)
}
/**
 * 更新交通图层数据
 */
async function updateTrafficLayer() {
  const layer = layerManger.findLayerById('trafficLayer')
  
  // 获取车速数据
  const speedData = await getSpeedData()
  // 复制一份数据
  const features = routeData.features.map(feature => {
      const router_id = feature.properties['ROUTE_ID'];      
      feature.properties.speed = speedData[router_id]; 
      return feature;
  });
  console.log(features)
  layer.setData({features})
}

/**
 * 获取交通XML数据并转换为对象格式
 */
async function getSpeedData() {
  
  const response = await fetch(`.//static/mock/irnAvgSpeed-all.xml`);
  const xmlText = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  // 解析XML数据
  const segments = xmlDoc.getElementsByTagName('segment');
  const speedData = {};
  for (let segment of segments) {
    // 添加异常处理    
    try {
      const router_id = segment.getElementsByTagName("segment_id")[0].textContent;
      const speed = parseFloat(segment.getElementsByTagName("speed")[0].textContent);
      // 确保获取到有效值
      if (router_id && !isNaN(speed)) {
        speedData[router_id] = speed;
      }
    } catch (error) {
      console.error('Error parsing segment:', error);
    }
  }
  return speedData;
}

/**
 * 切换图层的显示隐藏状态
 * @param layerId {String} 图层名称
 */
function toggleLayer(layerId) {
  switch (layerId) {
    case 'wx':
      const fn = wxLayer.getVisible() ? 'hide' : 'show'
      wxLayer[fn]()
      break;
    default:
      const layer = layerManger.findLayerById(layerId)      
      if (layer) {        
        const fn = (layer.visible ?? layer.getVisible()) ? 'hide' : 'show'        
        console.log('fn', fn)
        layer[fn]()
      }
      break;
  }
}

/**
 * 路径规划
 */
async function generateRoute(){
  const map = getMap()
  
  const start = startMarker.getPosition()
  const end = endMarker.getPosition()

  // 获取路径规划结果
  const res = await getNavRoute(wgs84togcj02(start.lng, start.lat), wgs84togcj02(end.lng, end.lat))
  console.log('路径规划结果:', res)

  if (!res.success) {
    console.error('路径规划失败:', res.message)
    return
  }

  // 路径规划结果
  const {coordinates, distance, duration, path} = res
  // const newCoordinates = coordinates.map(coord => gcj02towgs84(coord[0], coord[1]))
  // console.log(newCoordinates)

  // 提取TMCs数据并转换为GeoJSON
  const tmcsFeatures = []

  
  // 遍历所有步骤，提取TMCs数据
  if (path && path.steps) {
    path.steps.forEach(step => {
      if (step.tmcs && step.tmcs.length > 0) {
        step.tmcs.forEach(tmc => {
          // 解析TMC的坐标点
          if (tmc.tmc_polyline) {
            const tmcPoints = tmc.tmc_polyline.split(';').map(point => {
              const [lng, lat] = point.split(',').map(Number)
              // 将GCJ-02坐标转换为WGS-84坐标
              return gcj02towgs84(lng, lat)
              // return [lng, lat]
            })
            // 创建TMC特征
            tmcsFeatures.push({
              type: 'Feature',
              properties: {
                distance: tmc.tmc_distance,
                status:  ['畅通', '缓行', '拥堵', '严重拥堵', '未知'].indexOf(tmc.tmc_status),
              },
              geometry: {
                type: "MultiLineString",
                coordinates: [tmcPoints]
              }
            })
          }
        })
      }
    })
  }

  // 缓存数据
  pathData = { features: [...tmcsFeatures] } 

  console.log('pathData', pathData)

  // 如果已存在路径图层，更新路径数据
  const layer = layerManger.findLayerById('navPathLayer')
  if (layer) {   
    // 必须要显示延迟后，才能更新数据！
    layer.show()  
    setTimeout(()=>{
      layer.setData(pathData)  
    }, 100)          
  }

}

/**
 * 开始导航
 */
function startNavigator(){
  if(!pathData || pathData.length === 0){
    alert('请点击"规划路径"按钮')
    return
  }
  // 更新巡航图层
  const vehicleLayer = layerManger.findLayerById('drivingLayer')
  if (vehicleLayer) {
    vehicleLayer.setData(pathData)
    vehicleLayer.show()
  }
  // 更新巡航径图层
  const movePathLayer = layerManger.findLayerById('movePathLayer')
  if (movePathLayer) {
    movePathLayer.setData(pathData)
    movePathLayer.show()
  }
  // 隐藏规划路径图层
  const navPathLayer = layerManger.findLayerById('navPathLayer')
  if (navPathLayer) {
    navPathLayer.hide()
  }
}

/**
 * 切换自驾视角
 */
function toggleVehicleView() {
  const map = getMap()
  const drivingLayer = layerManger.findLayerById('drivingLayer')
  const movePathLayer = layerManger.findLayerById('movePathLayer')
  const targetValue = isFirstView ? false : true

  if (drivingLayer) {
    // 镜头跟随
    drivingLayer.setCameraFollow(targetValue)
  }
  if (movePathLayer) {
    // 显示路径
    movePathLayer[targetValue ? 'show' : 'hide']()
  }
  // map.setZoom(targetValue ? 17.5 : 15, false)

  isFirstView = targetValue
}

// 调节参数
function initGUI() {
  // gui = new dat.GUI();
}

// 回到中心
function gotoCenter() {
  setMapView({
    "center": [
        114.216678,
        22.316946
    ],
    "zoom": 15.95,
    "pitch": 48.27272727272729,
    "rotation": -19.799999999999983
  })
}

// 切换专题
function switchTopic(name) {
  // 专题包含哪些图层id
  const { layers, label } = SETTING.topicMap[name]

  console.log(layers)

  allLayers.forEach(({ name, id }) => {
    const layer = layerManger.findLayerById(id)
    if (!layer) {
      console.log(`${id} 不存在`)
      return
    }
    if (layers.includes(layer.id)) {
      layer.show()
      // animateLayer(layer)
    } else {
      layer.hide()
    }
  })
}

/**
 * 给图层的显示增加动画效果
 */
// function animateLayer(layer) {
//   switch (layer.id) {
//     case 'riskLayer':
//       layer.addAnimate({
//         key: 'height',
//         value: [0, 1],
//         duration: 2000,
//         easing: 'BackOut',
//       });
//       layer.addAnimate({
//         key: 'radius',
//         value: [0, 1],
//         duration: 2000,
//         easing: 'BackOut',
//         transform: 1000,
//         random: true,
//         delay: 5000,
//       });
//       break;
//     case 'producationLayer':
//       layer.addAnimate({
//         key: 'height',
//         value: [0, 1],
//         duration: 500,
//         easing: 'Linear',
//         transform: 500,
//         random: true,
//         delay: 5 * 1000,
//       });
//       break;
//     default:
//       break;
//   }
// }

</script>

<template>
  <div ref="container" class="container"></div>
  <div class="tool">

    <div class="btn" @click="gotoCenter()">回到中心</div>
    <div class="btn" @click="updateTrafficLayer()">更新拥堵情况</div> 
    <div class="btn" @click="generateRoute()">规划路径</div>    
    <div class="btn" @click="startNavigator()">开始导航</div> 
    <div class="btn" @click="toggleVehicleView()">行驶车辆跟踪</div> 

    <!-- <div class="btn" @click="filterStopLayer('all')">全部</div>
    <div class="btn" @click="filterStopLayer('bus')">巴士</div>
    <div class="btn" @click="filterStopLayer('gmb')">专线</div>
    <div class="btn" @click="filterStopLayer('tram')">电车</div> -->
  </div>
  <div class="layers-list">
    <div class="layers-list-h">
      图层管理
    </div>
    <div class="layers-list-b">
      <ul>
        <li v-for="(item, index) in allLayers" :key="index" @click="toggleLayer(item.id)">{{ item.name }}</li>
      </ul>
    </div>

  </div>
  <!-- 
  <div class="topic-list">
    <div v-for="(item, key) in SETTING.topicMap" :key="key" class="item" @click="switchTopic(key)">{{ item.label }}
    </div>
    <div class="item" @click="switchTopic('security')">安全</div>
  </div>
   -->
  <div class="mask"></div>
</template>

<style lang="scss" type="text/scss" scoped>
.container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #000;

}

.mask{
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: radial-gradient(transparent 40%, rgb(1, 18, 38));
}

.tool {
  position: absolute;
  bottom: 2em;
  left: 50%;
  width: 50%;
  text-align: center;
  transform: translate(-50%, 0);

  .btn {
    display: inline-block;
    margin: 0 .2em;
    ;
    padding: 0.3em .6em;
    background: rgba(6, 28, 151, 0.8);
    border: 1px solid #05c5f5;
    cursor: pointer;
    color: #eefcff;
    transition: all .4s ease-in-out;

    &:hover {
      background: rgba(8, 36, 192, 0.9);
      transform: translateY(4px);
    }
  }
}

.layers-list {
  // display: none;
  position: absolute;
  top: 100px;
  right: 20px;
  z-index: 999;
  background-color: rgba(4, 16, 85, 0.5);

  &-h {
    padding: .6em 1em;
    color: #fff;
    font-weight: bold;
    border-bottom: 1px solid rgb(51, 79, 236);
  }

  &-b {
    backdrop-filter: blur(10px);

    li {
      padding: .4em 1em;
      color: #fff;
      font-size: 14px;
      cursor: pointer;

      &:hover {
        background-color: rgb(59, 59, 245);
      }

      // &.active {
      //   border-left-color: #16e242;
      // }
    }
  }
}

.topic-list {
  display: flex;
  flex-direction: row;
  position: absolute;
  bottom: 5em;
  left: 50%;
  transform: translateX(-50%);
  background-color: blue;
  color: #fff;
  text-align: center;
  width: 200px;

  .item {
    padding: .4em;
    flex: 1;
    cursor: pointer;
    font-weight: bold;
  }

  .item:hover {
    background-color: #16e242;
  }
}
</style>
<style lang="scss" type="text/scss">
.amap-info-window {
  display: flex;
  flex-direction: column;
  width: 300px;
  background: #fff;
  border-radius: 3px;
  padding: 3px 7px;
  box-shadow: 0 2px 6px 0 rgba(114, 124, 245, .5);
  position: relative;
  font-size: 12px;

  .img-wrap {
    display: flex;
    height: 230px;    
    justify-content: center;
    align-items: center;
    overflow: hidden;
    margin-bottom: 8px;
    background-color: #ccc;
    
    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain; /* 保持图片比例，完整显示 */
    }
  }

  .bus-list {
    max-height: 300px;
    overflow-y: auto;
    
    .bus-line {
      padding: 8px 0;
      border-bottom: 1px solid #eee;
      
      &:last-child {
        border-bottom: none;
      }
    }
  }

  p {
    display: flex;
    line-height: 1.6em;
  }
}
.amap-info-tip{
  position: relative;  
  padding: 3px 7px;
  background: #fff;
  border-radius: 3px;
  min-width: 200px;
  font-size: 12px;
  line-height: 1.3em;
  box-shadow: 0 2px 6px 0 rgba(114, 124, 245, .5);
}
</style>