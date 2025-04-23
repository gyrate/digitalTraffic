import * as THREE from 'three'
import _ from 'lodash'
import BaseUtils from '../BaseUtils'

// 使用共享customLayer的模式
let _LAYER_COUNT = 0
let _CUSTOM_LAYER = null

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
  // 显示优先级 isInZooms > show()/hide()
  _visible = true

  // 资源基础路径
  _baseURL = '.'

  // 拾取事件，默认为mousemove
  _pickEvent = null

  // 光照强度
  _intensity = 0.3

  constructor (config) {
    super()
    this._conf = _.merge(this._conf, config)

    // 地图是必须项
    if (
      config.map === undefined ||
      config.map == null ||
      typeof config.map.getContainer !== 'function'
    ) {
      throw Error('config.map invalid')
    }
    this.map = config.map

    // 默认取地图容器
    this.container = config.container || config.map.getContainer()
    if (!this.container) {
      throw Error('config.container invalid')
    }

    this._interactAble = config.interact ?? false
    this.customCoords = this.map.customCoords
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
      this.updateCenter(config.center)
      this._center = config.center
    } else {
      const { lng, lat } = this.map.getCenter()
      this.updateCenter([lng, lat])
      this._center = [lng, lat]
    }

    this.reviseVisible()

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

    // onRay方法 防抖动
    this.handleOnRay = _.debounce(this.onRay, 100, true)

    // 绑定this
    this.bindMethods(['animate', 'resizeLayer', 'handleOnRay'])

    // three相关属性
    this.camera = null
    this.renderer = null
    this.scene = null
    // 事件监听字典
    this.eventMap = {}
    this.preparea()
  }

  async preparea () {
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
      this.map.remove(this.layer)
      //   this.layer.destroy()
    }
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.material) {
          child.material.dispose()
        }
        if (child.geometry) {
          child.geometry.dispose()
        }
        //   this.scene.remove(child)
      })
      this.scene = null
    }
    if (this.renderer) {
      this.camera = null
      this.renderer.clear()
      this.renderer.dispose()
      this.renderer = null
    }
    for (const key in this) {
      delete this[key]
    }

    _LAYER_COUNT -= 1
    if (_LAYER_COUNT <= 0) {
      _CUSTOM_LAYER.destroy()
      _CUSTOM_LAYER = null
      _LAYER_COUNT = 0
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
    this._conf.visible = val === true
    this.reviseVisible()
  }

  /**
   * 获取当前图层的显示状态
   * @returns  {Boolean}
   */
  getVisible () {
    return this._visible
  }

  /**
   * @description 修正内部visible的值
   * @params {Boolean,undefined} val
   * @private
   * @return {Boolean}
   */
  reviseVisible (val) {
    let targetValue

    if(this.isInZooms()){
      targetValue = typeof val === 'boolean' ? val : true
    } else {
      targetValue = false
    }

    if (targetValue !== this._visible) {
      this.handleEvent('visibleChange', targetValue)
      if (targetValue === false) {
        this.renderer && this.renderer.clear()
      }
    }

    this._visible = targetValue
    return this._visible
  }

  /**
   * @private
   * @description 设置图层中心坐标，非常重要
   * @param {Array} lngLat
   */
  updateCenter (lngLat) {
    if (lngLat instanceof Array) {
      // 注意：customCoords是map成员，所有图层实例共享的，更改center要小心
      this.customCoords.setCenter(lngLat)
    }
    this._center = this.customCoords.getCenter()
  }

  /**
   * @private
   * @description 初始化three实例
   * @param {*} gl
   */
  initThree (gl) {
    const { clientWidth, clientHeight } = this.container
    this.camera = new THREE.PerspectiveCamera(
      60,
      clientWidth / clientHeight,
      100,
      1 << 30
    )

    const { antialias, precision } = this._conf.renderOption
    const option = {
      alpha: true,
      antialias,
      precision
    }
    if (this._conf.alone) {
      option.context = this._canvas.getContext('webgl')
    } else {
      option.context = gl
    }

    const renderer = new THREE.WebGLRenderer(option)
    // 必须设置为false才能实现多个render的叠加
    renderer.autoClear = false
    renderer.setClearAlpha(0)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.setSize(clientWidth, clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)

    this.renderer = renderer
    this.scene = new THREE.Scene()
    // 增加环境光，否则模型的纹理看不到
    if (this._intensity > 0) {
      const aLight = new THREE.AmbientLight(0xffffff, this._intensity)
      this.scene.add(aLight)
    }
  }

  /**
   * @private
   * @description 异步初始化图层
   * @returns {}
   */
  async initLayer () {
    if (this._conf.alone) {
      this.layer = await this.createCustomLayer()
    } else {
      this.layer = await this.createGlCustomLayer()
    }
    if (this._conf.visible) {
      this.layer.show()
    } else {
      this.layer.hide()
    }
  }

  /**
   * 调整图层的透明度
   * @param value
   */
  setOpacity (value = 1) {
    if (this.layer) {
      this.layer.setOpacity(value)
    }
  }

  /**
   * @description 创建独立图层
   * @private
   * @return {AMap.CustomLayer}
   */
  createCustomLayer () {
    return new Promise((resolve) => {
      if (_CUSTOM_LAYER) {
        this._canvas = _CUSTOM_LAYER.canvas
        this.initThree()
        this.updateCenter(this._center)
      } else {
        const { clientWidth, clientHeight } = this.container
        this._canvas = document.createElement('canvas')
        this._canvas.id = 'gl-layers'
        this._canvas.width = clientWidth
        this._canvas.height = clientHeight
        this._canvas.style.cssText = `width: ${clientWidth}px; height: ${clientHeight}px;`

        const layer = new AMap.CustomLayer(this._canvas, {
          visible: true,
          zIndex: this._conf.zIndex,
          alwaysRender: true
        })

        this.initThree()
        this.updateCenter(this._center)

        layer.render = () => {
          if (this.renderer == null) {
            return
          }
          // this.updateCamera()
          this.onRender()
        }
        this.map.add(layer)

        _CUSTOM_LAYER = layer
      }

      _LAYER_COUNT += 1

      resolve(_CUSTOM_LAYER)
    })
  }

  /**
   * 创建非独立图层
   * @return  {AMap.GlCustomLayer}
   */
  createGlCustomLayer () {
    return new Promise((resolve) => {
      const layer = new AMap.GLCustomLayer({
        zIndex: this._conf.zIndex,
        visible: true, // 设置为true时才会执行init
        init: (gl) => {
          this.initThree(gl)
          this.updateCenter(this._center)

          this.reviseVisible()

          resolve(layer)
        },
        render: (gl) => {
          this.updateCamera()
          this.onRender()
        }
      })
      this.map.add(layer)
    })
  }

  updateCamera () {
    // console.log('this.updateCamera')
    const { scene, renderer, camera, customCoords } = this
    if (!renderer) {
      return
    }
    // 保证投影正常显示
    renderer.resetState()

    // 重新定位中心，这样才能使当前图层与Loca图层共存时显示正常
    if (this._center) {
      customCoords.setCenter(this._center)
    }
    const { near, far, fov, up, lookAt, position } =
      customCoords.getCameraParams()

    camera.near = near // 近平面
    camera.far = far // 远平面
    camera.fov = fov // 视野范围
    camera.position.set(...position)
    camera.up.set(...up)
    camera.lookAt(...lookAt)

    // 更新相机坐标系
    camera.updateProjectionMatrix()

    // 如果有后期处理，就渲染Composer
    if (this.composer) {
      this.composer.render()
    } else {
      if (this._visible) {
        renderer.render(scene, camera)
      }
    }

    // 这里必须执行！重新设置 three 的 gl 上下文状态
    renderer.resetState()
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
      this.updateCamera()
    } else if (this.map) {
      this.map.render()
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

    if (typeof this.onPicked === 'function' && this._interactAble && this._visible) {
      this.onPicked.apply(this, [{ targets: intersects, event }])
    }
    return intersects
  }

  /**
   * 获取射线拾取的mesh
   * @param {*} event
   * @returns {*}
   */
  getRayPickMesh(event){
    const { scene, camera } = this
    if (!scene) {
      return
    }
    const pickPosition = this.setPickPosition(event)
    this._raycaster.setFromCamera(pickPosition, camera)
    const intersects = this._raycaster.intersectObjects(scene.children, true)
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
    this.map.on('zoomend', (event) => {
      this.reviseVisible()
    })
  }

  /**
   * @protected
   * @description 判断当前图层是否在可以显示的范围内
   * @returns {boolean}
   */
  isInZooms () {
    const zoom = this.map.getZoom()
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
    if (this.layer) {
      if (this._conf.alone === false) {
        this.layer.show()
      }
      this.reviseVisible(true)
    }
  }

  /**
   * @public
   * @description 隐藏当前图层
   */
  hide () {
    if (this.layer) {
      // debugger
      if (this._conf.alone === false) {
        this.layer.hide()
      }
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
   * @description 获取当前地图的分辨率,分辨率是指1个像素代表的实际距离
   * @return {*|null}
   */
  getResolution () {
    if (typeof this.map.getResolution === 'function') {
      return this.map.getResolution()
    } else {
      return null
    }
  }
}

export default Layer
