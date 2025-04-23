import Layer from '../core/Layer'
import * as THREE from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import CustomShader from '../shader/Scane'

/**
 * 城市建筑群体图层,可调整外观和动画
 * @see {@link https://lbs.iot-cas.com/gl-layers/docs/demos/index.html#/BuildingLayer}
 * @extends Layer
 * @author Zhanglinhai <gyrate.sky@qq.com>
 */
class BuildingLayer extends Layer {
  // 数据原始数据
  _data = []

  _map = null

  // 建筑默认高度
  _defaultHeight = 50

  // 状态光环
  _uniforms = {
    // 建筑顶部贴图
    topMap: {
      value: null
    },
    // 建筑侧边贴图
    sideMap: {
      value: null
    },
    innerCircleWidth: {
      value: 0
    },
    // 波动环宽度
    circleWidth: {
      value: null
    },
    // 圆环颜色
    color: {
      value: null
    },
    // 圆环透明度
    opacity: {
      value: 0.8
    },
    // 环圆心位置
    center: {
      value: null
    }
  }

  // 材质缓存
  _mt = {
    side: null,
    top: null
  }

  // 设置了最大可渲染的建筑数以防性能问题
  _limitCount = 0
  _limitMax = 50000

  /**
   * 创建一个实例
   * @param {Object}   config
   * @param {GeoJSON}    config.data  建筑数据   required
   * @param {Array}    config.zooms  显示区间，默认值 [5,14]
   * @param {Boolean}  config.animate  是否显示动画,默认值false
   * @param {THREE.Texture}  config.sideMap  建筑侧边纹理实例,默认值 THREE.TextureLoader().load('./static/texture/texture_building_1.png')
   * @param {THREE.Texture}  config.topMap  建筑顶部纹理实例,默认值 THREE.TextureLoader().load('./static/texture/texture_building_2.png')
   * @param {THREE.Color}  config.color 波动颜色，默认值 THREE.Color(0xffffff)
   * @param {Number} config.circleWidth 波动圆环宽度,默认值 100
   * @param {Number} config.maxRadius 最大波动半径,默认值1000
   * @param {Array} config.circleCenter 波动环圆心坐标,默认值 [0,0]
   * @param {Array} [config.pulseSpeed=1] 波动速度倍率
   */
  constructor (config) {
    const conf = {
      animate: true,
      zooms: [5, 14],
      data: null,
      sideMap: null,
      topMap: null,
      color: null,
      circleWidth: 50,
      maxRadius: 1000,
      circleCenter: [0, 0],
      pulseSpeed: 1,
      heightField: 'height',
      ...config
    }
    super(conf)
    this.initData(conf.data)
    this.initProps()
  }

  initData (geoJSON) {
    const { features } = geoJSON
    const { heightField } = this._conf
    this._data = JSON.parse(JSON.stringify(features))
    this._data.forEach((feature, index) => {
      const { geometry, properties } = feature
      const { type, coordinates } = geometry
      if (type === 'MultiPolygon') {
        feature.geometry.coordinates = coordinates.map(sub => {
          return this.customCoords.lngLatsToCoords(sub)
        })
      }
      if (type === 'Polygon') {
        feature.geometry.coordinates = this.customCoords.lngLatsToCoords(coordinates)
      }
      feature.properties.height = properties[heightField]
    })
    console.log(this._data)
  }

  initProps () {
    const { _conf, _uniforms, _baseURL } = this
    // 建筑侧边纹理
    if (_conf.sideMap) {
      _uniforms.sideMap.value = _conf.sideMap
    } else {
      _uniforms.sideMap.value = new THREE.TextureLoader().load(this.mergeSourceURL('./static/texture/texture_building_1.png'))
    }
    // 建筑顶部纹理
    if (_conf.topMap) {
      _uniforms.topMap.value = _conf.topMap
    } else {
      const texture = new THREE.TextureLoader().load(this.mergeSourceURL('./static/texture/texture_building_2.png'))
      // texture.wrapS = THREE.RepeatWrapping
      // texture.wrapT = THREE.RepeatWrapping
      // texture.repeat.set(0.01, 0.01)
      _uniforms.topMap.value = texture
    }
    // 波动颜色
    _uniforms.color.value = _conf.color || new THREE.Color(0x54e2f9)
    // 波动环宽度
    _uniforms.circleWidth.value = _conf.circleWidth
    // 波动环圆心
    _uniforms.center.value = new THREE.Vector3(this._conf.circleCenter[0], this._conf.circleCenter[1], 0)
  }

  onReady () {
    // // this.createHelper()
    this.initMt()
    this.createPolygon()

    // const spotLight = new THREE.SpotLight('#ffffff', 0.4)
    // spotLight.position.set(0, 0, 1000)
    // this.scene.add(spotLight)
  }

  initMt () {
    const { vertexShader, fragmentShader } = CustomShader

    const {
      sideMap,
      topMap,
      innerCircleWidth,
      circleWidth,
      color,
      opacity,
      center
    } = this._uniforms

    // 顶部材质
    this._mt = new THREE.ShaderMaterial({
      uniforms: {
        topMap,
        sideMap,
        innerCircleWidth,
        circleWidth,
        color,
        opacity,
        center
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      depthTest: true,
      transparent: true
    })
  }

  /**
   * 根据数据创建所有模型到场景
   */
  createPolygon () {
    let sideGeometryArr = []
    let topGeometryArr = []

    this._data.forEach((item, index) => {
      const { geometry, properties } = item
      const { type, coordinates } = geometry

      // 对象为单体多边形
      if (type === 'Polygon') {
        const { sides, tops } = this._createPolygon(coordinates, properties)
        sideGeometryArr = sideGeometryArr.concat(sides)
        topGeometryArr = topGeometryArr.concat(tops)
      }

      // 对象多体多边形
      if (type === 'MultiPolygon') {
        coordinates.forEach(sub => {
          const { sides, tops } = this._createPolygon(sub, properties)
          sideGeometryArr = sideGeometryArr.concat(sides)
          topGeometryArr = topGeometryArr.concat(tops)
        })
      }
    })

    // todo: 顶部shapeGeometry,侧边bufferGeomerty，需要类型一致才能合并为一个几何体

    // 合并侧边
    const mesh0 = new THREE.Mesh(mergeBufferGeometries(sideGeometryArr, false), this._mt)
    this.scene.add(mesh0)

    // 合并顶部
    const mesh1 = new THREE.Mesh(mergeBufferGeometries(topGeometryArr, false), this._mt)
    this.scene.add(mesh1)
  }

  /**
   * 根据路径绘制单个多边几何体
   * @param paths
   * @param properties
   * @returns {{tops: Array, sides: Array}}
   * @private
   */
  _createPolygon (paths = [], properties) {
    const sides = []; const tops = []
    paths.forEach(path => {
      if (this._limitCount >= this._limitMax) {
        return
      }
      // 绘制侧边几何体
      const side = this.drawSide(path, properties)
      sides.push(side)

      // 绘制顶部几何体
      const top = this.drawTop(path, properties)
      tops.push(top)

      this._limitCount++
    })
    return { sides, tops }
  }

  /**
   * @description 绘制建筑侧边
   * @param {Array} path 边界路线
   * @param {Object} option 配置项
   * @param {Number} option.height 区块高度
   * @param {String} option.name 区块名称
   */
  drawSide (path, { height, name, fill }) {
    // 创建立面
    const geometry = this.createSideGeometry(path, height || this._defaultHeight)
    return geometry
  }

  /**
   * @description 绘制建筑顶部
   * @param {Array} path 区块边界数据
   * @param {Object} option 配置项
   * @param {Number} option.height 区块高度
   * @param {String} option.name 区块名称
   */
  drawTop (path, { height, name }) {
    const shape = new THREE.Shape()
    path.forEach(([x, y], index) => {
      if (index === 0) {
        shape.moveTo(x, y)
      } else {
        shape.lineTo(x, y)
      }
    })

    // 顶部面
    const geometry = new THREE.ShapeGeometry(shape)
    const z = height || this._defaultHeight

    // 设置高度
    geometry.attributes.position.array.forEach((v, i) => {
      if ((i + 1) % 3 === 0) {
        geometry.attributes.position.array[i] = z
      }
    })

    return geometry
  }

  /**
   * 根据路线创建侧面几何面
   * @param  {Array} path [[x,y],[x,y],[x,y]...] 路线数据
   * @param  {Number} height 几何面高度，默认为0
   * @returns {THREE.BufferGeometry}
   */
  createSideGeometry (path, height = 0) {
    if (path instanceof Array === false) {
      throw 'createSideGeometry: path must be array'
    }

    // 保持path的路线是闭合的
    if (path[0].toString() !== path[path.length - 1].toString()) {
      path.push(path[0])
    }

    const vec3List = [] // 顶点数组
    let faceList = [] // 三角面数组
    let faceVertexUvs = [] // 面的UV层队列，用于纹理和几何信息映射

    const t0 = [0, 0]
    const t1 = [1, 0]
    const t2 = [1, 1]
    const t3 = [0, 1]

    for (let i = 0; i < path.length; i++) {
      const [x1, y1] = path[i]
      vec3List.push([x1, y1, 0])
      vec3List.push([x1, y1, height])
    }

    for (let i = 0; i < vec3List.length - 2; i++) {
      if (i % 2 === 0) {
        // 下三角
        faceList = [
          ...faceList,
          ...vec3List[i],
          ...vec3List[i + 2],
          ...vec3List[i + 1]
        ]
        // UV
        faceVertexUvs = [...faceVertexUvs, ...t0, ...t1, ...t3]
      } else {
        // 上三角
        faceList = [
          ...faceList,
          ...vec3List[i],
          ...vec3List[i + 1],
          ...vec3List[i + 2]
        ]
        // UV
        faceVertexUvs = [...faceVertexUvs, ...t3, ...t1, ...t2]
      }
    }

    const geometry = new THREE.BufferGeometry()
    // 顶点三角面
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(faceList), 3)
    )
    // UV面
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(faceVertexUvs), 2)
    )

    return geometry
  }

  // 更新纹理偏移量
  update () {
    if (!this._isAnimate) {
      return
    }

    const { innerCircleWidth, circleWidth, opacity } = this._uniforms

    innerCircleWidth.value += 10 * this._conf.pulseSpeed
    if (innerCircleWidth.value > this._conf.maxRadius) {
      innerCircleWidth.value = 0
    }
  }

  /**
   * 设置扫光的样式
   * @param conf
   */
  setSweepStyle (conf) {
    const { center } = this._uniforms
    // todo: 圆心需要转换坐标
    center.value = conf.center
  }
}

export default BuildingLayer
