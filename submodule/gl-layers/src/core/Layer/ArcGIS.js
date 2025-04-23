import * as THREE from 'three'
import _ from 'lodash'
import BaseUtils from '../BaseUtils'
import * as externalRenderers from '@arcgis/core/views/3d/externalRenderers'
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils'

/**
 * @description THREEJS 自定义图层基类
 * @class Layer
 * @author Zhanglinhai <gyrate.sky@qq.com>
 * @constructor
 * @param  {Object}  config
 * @param  {Map}     config.map 依赖的地图示例 required
 * @param  {String}  config.id 图层唯一标识，默认值 创建时间毫秒值
 * @param  {Number}  [config.zIndex=120] 图层层级
 * @param  {String}  [config.title=''] 图层标题
 * @param  {Array}   [config.center] 图层中心 [lng,lat]
 * @param  {Boolean} [config.animate=true] 是否支持动画
 * @param  {Boolean} [config.intensity=0.3] 光照强度
 * @param  {Array}   [config.zooms=[3,22]] 缩放范围，图层仅在该范围中出现
 * @param  {Boolean} [config.interact=false] 支持鼠标交互
 * @param  {Boolean} [config.pickEvent] 指定由什么事件触发拾取，默认为mousemove,可选值为：mousemove、click
 * @param  {String}  [config.baseURL] 图层静态资源的基础路径
 * @param  {RenderOption} [config.renderOption] 渲染器配置参数
 * @param  {Boolean} [config.alone=false] 是否独立渲染图层
 * @param  {Boolean} [config.visible=true] 图层的初始状态是否为显示
 */
class Layer extends BaseUtils {
  // 图层唯一标识
  id = null

  // 图层标题
  title = ''

  // 图层画布
  _canvas = null

  // 用于添加后期（实验性）
  composer = null

  // 配置项
  _conf = {
    /**
     * @typedef {Object} RenderOption 渲染器配置参数
     * @property {Boolean} [antialias=false] - 是否开启抗锯齿，让画面看起来更加平滑，有性能消耗
     * @property {String} [precision='highp'] - 着色器精度. 可以是"highp","mediump","lowp".
     */
    renderOption: {
      antialias: false,
      precision: 'highp'
    },
    alone: true,
    zIndex: 120,
    visible: true
  }

  // 图层显示范围
  _zooms = [3, 22]

  // 默认支持动画
  _isAnimate = true

  // 图层中心坐标
  _center = null

  // 射线，用于做物体拾取
  _raycaster = null

  // 支持鼠标交互
  _interactAble = false

  // 当前图层是否应该显示
  // 受conf.visible和isInZooms影响
  _visible = true

  // 资源基础路径
  _baseURL = '.'

  // 拾取事件，默认为mousemove
  _pickEvent = null

  // 光照强度
  _intensity = 0.3

  // arcGIS额外渲染器
  _externalRenderer = null
  // arcGIS的数据和事件监听器
  _listeners = []

  constructor (config) {
    super()
    this._conf = _.merge(this._conf, config)

    // 地图是必须项
    if (
      config.map === undefined ||
      config.map == null
    ) {
      throw Error('config.map invalid')
    }
    this.map = config.map
    this.view = config.view

    // 默认取地图容器
    this.container = this.view.container
    if (!this.container) {
      throw Error('config.container invalid')
    }

    this._interactAble = config.interact || false
    // this.customCoords = this.map.customCoords // delete
    this.layer = null
    // 不保留原始data
    delete this._conf.data

    this.id = config.id || new Date().getTime().toString()

    this.title = config.title || ''

    // 显示范围
    if (config.zooms) {
      this._zooms = config.zooms
    }
    // 支持动画
    if (config.animate !== undefined) {
      this._isAnimate = config.animate
    }
    if (config.center) {
      //   this.updateCenter(config.center)
      this._center = config.center
      // } else {
      //   const { lng, lat } = this.map.getCenter()
      //   this.updateCenter([lng, lat])
      //   this._center = [lng, lat]
    }

    this.reviseVisible()

    this.customCoords = {
      view: this.view,
      lngLatsToCoords: this.lngLatToCoords.bind(this)
    }

    // 支持光照
    if (typeof config.intensity === 'number') {
      this._intensity = config.intensity
    }

    // 资源基础路径
    if (config.baseURL !== undefined) {
      this._baseURL = config.baseURL
    }

    // 触发拾取的事件类型
    if (!config.pickEvent) {
      this._pickEvent = config.pickEvent || 'mousemove'
    }

    // onRay方法 arcGIS防抖动开启时滞后严重
    // this.handleOnRay = _.debounce(this.onRay, 50, true)
    this.handleOnRay = this.onRay

    // 绑定this
    this.bindMethods(['animate', 'resizeLayer', 'handleOnRay'])

    // three相关属性
    this.camera = null
    this.renderer = null
    this.scene = null
    // 事件监听字典
    this.eventMap = {}
    this.prepare()
  }

  async prepare () {
    this.initZooms()
    this.addModuleListener()
    await this.initLayer()
    this.onReady()
    this._initInteract()
    this.animate()

    /**
     * 初始化完成，返回整个图层实例
     * @event  Layer#complete
     * @type {object}
     * @property {Object} scene 图层场景
     * @property {Object} camera 图层相机
     */
    this.handleEvent('complete', this)
  }

  /**
   * @abstract
   * @description GLCustomLayer已经准备好时执行,需要子类覆盖
   */
  onReady () {
    throw Error('该方法只能被子类重写')
  }

  /**
   * @abstract
   * @description 每次渲染时执行
   */
  onRender () {}

  /**
   * @abstract
   * @description 更新图层属性，需要子类覆盖
   */
  update () {}

  /**
   * @abstract
   * @description 图层销毁前执行
   */
  beforeDestroy () {}

  /**
   * @public
   * @description 添加辅助坐标， 红色代表 X 轴. 绿色代表 Y 轴. 蓝色代表 Z 轴
   * @param {Array} position 坐标原点的位置,默认值[x,y,z]
   * @param {Number} length 坐标轴可见长度,默认值 15000
   */
  createHelper (position = [0, 0, 0], length = 15000) {
    const axesHelper = new THREE.AxesHelper(length)
    const [x, y, z] = position
    axesHelper.position.set(x, y, z)
    this.scene.add(axesHelper)
  }

  /**
   * @protected
   * @description 根据地图像素点，获取图层要素
   * @param {*} event 鼠标事件
   * @returns {Array} 图层要素数组
   */
  queryFeature (event) {
    return new Promise((resolve) => {
      const res = this.onRay(event)
      resolve(res)
    })
  }

  /**
   * @public
   * @description 销毁当前图层
   */
  destroy () {
    if (typeof this.beforeDestroy === 'function') {
      this.beforeDestroy()
    }
    this.removeModuleListener()
    if (this.layer) {
      this.layer.hide()
    }
    if (this._externalRenderer) {
      externalRenderers.remove(this.view, this._externalRenderer)
    }
    this._listeners.forEach(item => {
      item.remove()
    })
    this._listeners = []
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.material) {
          child.material.dispose()
        }
        if (child.geometry) {
          child.geometry.dispose()
        }
      })
      this.scene = null
    }
    if (this.renderer) {
      this.camera = null
      this.renderer.clear(false, false, false)
      this.renderer.dispose()
      this.renderer = null
    }
    for (const key in this) {
      delete this[key]
    }
  }

  /**
   * @public
   * @description 设置图层中心
   * @param {Array} lngLat [lng,lat]
   * @example
   * setCenter([112,37])
   */
  setCenter (lngLat) {
    this._center = lngLat
  }

  /**
   * 设置当前图层的显示状态
   * @param {Boolean} val 显示
   */
  setVisible (val) {
    this.reviseVisible(val)
  }

  /**
   * 获取当前图层的显示状态
   * @returns  {Boolean}
   */
  getVisible () {
    return this._visible
  }

  /**
   * @description 结合zooms和visible，修正图层的显示状态
   * @param {Boolean} val
   * @private
   */
  reviseVisible (val) {
    const targetValue = typeof val === 'boolean' ? val && this.isInZooms() : this.isInZooms()
    if (targetValue !== this._visible) {
      this.handleEvent('visibleChange', targetValue)
      if (targetValue === false) {
        this.renderer && this.renderer.clear()
      }
    }
    this._visible = targetValue
  }

  /**
   * @private
   * @description 设置图层中心坐标，非常重要
   * @param {Array} lngLat
   */
  updateCenter (lngLat) {
    // if (lngLat instanceof Array) {
    //   // 注意：customCoords是map成员，所有图层实例共享的，更改center要小心
    //   this.customCoords.setCenter(lngLat)
    // }
    // this._center = this.customCoords.getCenter()

    const { latitude, longitude } = this.view.center
    this._center = [latitude, longitude]
  }

  /**
   * @private
   * @description 初始化three实例
   * @param {*} gl
   */
  initThree (context) {
    const { view } = this
    const renderer = new THREE.WebGLRenderer({
      context: context.gl, // 可用于将渲染器附加到已有的渲染环境(RenderingContext)中
      premultipliedAlpha: false, // renderer是否假设颜色有 premultiplied alpha. 默认为true
      alpha: true
    })
    this.renderer = renderer

    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setViewport(0, 0, view.width, view.height)

    renderer.autoClearDepth = false // 定义renderer是否清除深度缓存
    renderer.autoClearStencil = false // 定义renderer是否清除模板缓存
    renderer.autoClearColor = false // 定义renderer是否清除颜色缓存

    // 场景
    this.scene = new THREE.Scene()
    // 相机
    this.camera = new THREE.PerspectiveCamera()

    // 环境光
    const ambient = new THREE.AmbientLight(0xffffff, 0.8)
    this.scene.add(ambient)
    //
    // // 平行光
    // const dLight = new THREE.DirectionalLight(0xffffff, 1)
    // dLight.position.set(1, 1, 1)
    // this.scene.add(dLight)

    // const axesHelper = new THREE.AxesHelper(100000000)
    // this.scene.add(axesHelper)
  }

  /**
   * @description 创建独立图层
   * @private
   * @return {AMap.CustomLayer}
   */
  async initLayer () {
    const t = this
    const { view } = t

    this._externalRenderer = {
      setup: function (context) {
        // 安装代码，执行一次
        t.initThree(context)
      },
      render: function (context) {
        // 每帧执行
        t.updateCamera(context)
      },
      dispose (context) {
        // 移除时执行
      }
    }
    externalRenderers.add(view, this._externalRenderer)
  }

  /**
   * 调整图层的透明度
   * @param value
   */
  setOpacity (value = 1) {
    // 待解决, 调整this._externalRenderer内容的透明度
  }

  // 更新相机
  updateCamera (context) {
    const { view } = this
    // 调整镜头
    const cam = context.camera
    this.camera.position.set(cam.eye[0], cam.eye[1], cam.eye[2])
    this.camera.up.set(cam.up[0], cam.up[1], cam.up[2])
    this.camera.lookAt(new THREE.Vector3(cam.center[0], cam.center[1], cam.center[2]))
    this.camera.projectionMatrix.fromArray(cam.projectionMatrix)

    // 绘制场景
    this.renderer.resetState()

    if (this._visible) {
      // 必要！重新绑定renderer
      context.bindRenderTarget()
      this.renderer.render(this.scene, this.camera)
      // 请求重绘视图
      externalRenderers.requestRender(view)
    } else {
      // 不渲染
      this.renderer.clear()
    }
    // 请求重绘视图
    externalRenderers.requestRender(view)
    // 清除WebGL状态
    context.resetWebGLState()
  }

  /**
   * @private
   * @description 执行逐帧动画
   */
  animate (time) {
    if (!this.renderer) {
      return
    }
    if (this.update) {
      this.update(time)
      // this.handleEvent('update', this)
    }
    if (this._conf.alone) {
      // this.updateCamera()
    } else if (this.map) {
      // this.map.render()
    }
    requestAnimationFrame(this.animate)
  }

  /**
   * @private
   * @description 初始化鼠标交互
   */
  _initInteract () {
    if (this._interactAble === false) {
      return
    }
    // const t = this
    this._raycaster = new THREE.Raycaster()
    if (this._pickEvent) {
      this.container.addEventListener(this._pickEvent, this.handleOnRay)
    }
  }

  /**
   * 在光标位置创建一个射线，捕获物体
   * @param event
   * @return {*}
   */
  onRay (event) {
    const { scene, camera } = this

    if (!scene) {
      return
    }

    const pickPosition = this.setPickPosition(event)

    this._raycaster.setFromCamera(pickPosition, camera)

    const intersects = this._raycaster.intersectObjects(scene.children, true)

    if (typeof this.onPicked === 'function' && this._interactAble) {
      this.onPicked.apply(this, [{ targets: intersects, event }])
    }
    return intersects
  }

  /**
   * @private
   * @description 获取鼠标在three.js 中的归一化坐标
   * @param {*} event
   * @returns {{x: number, y: number}}
   */
  setPickPosition (event) {
    const pickPosition = { x: 0, y: 0 }
    const rect = this.container.getBoundingClientRect()
    // // 将鼠标位置归一化为设备坐标, x 和 y 方向的取值范围是 (-1 to +1)
    pickPosition.x = (event.clientX / rect.width) * 2 - 1
    pickPosition.y = (event.clientY / rect.height) * -2 + 1
    return pickPosition
  }

  /**
   * @protected
   * @description 控制图层显示范围
   */
  initZooms () {
    const handler = this.view.watch('zoom', (event) => {
      this.reviseVisible()
    })
    this._listeners.push(handler)
  }

  /**
   * @protected
   * @description 判断当前图层是否在可以显示的范围内
   * @returns {boolean}
   */
  isInZooms () {
    const zoom = this.view.zoom
    return zoom >= this._zooms[0] && zoom <= this._zooms[1]
  }

  /**
   * @description 添加DOM监听事件
   * @private
   */
  addModuleListener () {
    window.addEventListener('resize', this.resizeLayer)
  }

  /**
   * @description 移除DOM监听事件
   * @private
   */
  removeModuleListener () {
    window.removeEventListener('resize', this.resizeLayer)

    if (this._pickEvent) {
      this.container.removeEventListener(this._pickEvent, this.onRay)
    }
  }

  /**
   * @description 更新当前视口
   * @private
   */
  resizeLayer () {
    const { clientWidth, clientHeight } = this.container
    if (this._canvas) {
      this._canvas.width = clientWidth
      this._canvas.height = clientHeight
      this._canvas.style.width = clientWidth + 'px'
      this._canvas.style.height = clientHeight + 'px'
    }
    if (this.camera) {
      this.camera.aspect = clientWidth / clientHeight
    }
  }

  /**
   * @public
   * @description 显示当前图层
   */
  show () {
    if (this.scene) {
      this.reviseVisible(true)
    }
  }

  /**
   * @public
   * @description 隐藏当前图层
   */
  hide () {
    if (this.scene) {
      this.reviseVisible(false)
    }
  }

  /**
   * 当前图层是否为显示状态
   * @public
   * @return {Boolean}
   */
  isVisible () {
    return this._visible === true
  }

  /**
   * @public
   * @description 绑定方法的this指向当前对象
   */
  bindMethods (fnNames) {
    fnNames.forEach((name) => {
      this[name] = this[name].bind(this)
    })
  }

  /**
   * 调整静态资源路径
   * url如果以http或.开头则直接返回，否则加上baseURL前缀后返回
   * @param {String} url 静态资源路径
   */
  mergeSourceURL (url) {
    if (typeof url !== 'string') {
      console.error('mergeSourceURL param "url" must be Sting')
      return null
    } else if (url.startsWith('http') || url.startsWith('.')) {
      return url
    } else {
      return `${this._baseURL}${url}`
    }
  }

  /**
   * 经纬度坐标值转换为空间坐标值
   * @param {Array} lngLats 经纬度坐标数组 [[x1,y1],[x2,y2]...]
   * @return {Array}
   */
  lngLatToCoords (lngLats) {
    const { view } = this

    if (lngLats[0][0] instanceof Array) {
      // 处理三维数组
      const res = lngLats.map(lngLatArr => {
        return this.lngLatToXyz(lngLatArr, view)
      })
      return res
    } else if (lngLats[0] instanceof Array) {
      // 处理二维数组
      return this.lngLatToXyz(lngLats, view)
    }
  }

  /**
   * 将经纬度坐标数组转换为THREE空间坐标值
   * @param {Array} lngLats 坐标数组
   * @param {sceneView} view 当前视图
   * @return {Array}
   */
  lngLatToXyz (lngLats, view) {
    // 经纬度转墨卡托平面坐标
    const originPos = lngLats.map(([lng, lat, altitude]) => {
      const [x, y] = webMercatorUtils.lngLatToXY(lng, lat)
      return [x, y, altitude || 0]
    }).flat()

    // 转换结果(一维数组)
    const dist = externalRenderers.toRenderCoordinates(
      view,
      originPos,
      0,
      view.center.spatialReference,
      new Float32Array(originPos.length),
      0,
      originPos.length / 3
    )

    // 重新转为二维数组
    const res = []
    for (let i = 0; i < dist.length; i += 3) {
      res.push([dist[i], dist[i + 1], dist[i + 2]])
    }
    return res
  }

  /**
   * @description 获取当前地图的分辨率,分辨率是指1个像素代表的实际距离
   * @return {*|null}
   */
  getResolution () {
    if (typeof this.map.getResolution === 'function') {
      return this.map.getResolution()
    } else if (this.view) {
      return this.view.resolution
    } else {
      return null
    }
  }
}

export default Layer
