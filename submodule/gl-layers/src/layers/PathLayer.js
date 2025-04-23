import Layer from '../core/Layer'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'

/**
 *  路径图层,可独立设置线宽和颜色等样式
 *  @extends Layer
 *  @author Zhanglinhai <gyrate.sky@qq.com>
 */
class PathLayer extends Layer {
  // 数据 [{coordinates, properties}]
  _data = []

  // 用于存放路径Mesh
  _group = new THREE.Group()

  // 材质Map {key: material}
  _materialMap = {}

  /**
   *  创建一个实例
   *  @param {Object}   config
   *  @param {geoJSON}  config.data 路径数据  required
   *  @param {Number}   [config.altitude=0.0] 整体海拔高度，如果数据中没有z坐标，则使用此值
   *  @param {Array}    [config.zooms=[5,14]] 显示区间
   *  @param {Object}   [config.styles={0: {color:'#000', lineWidth:1.0}}] 路径样式声明 
   *  @param {Function} [config.getStyle] 获取样式的方法
   */
  constructor(config) {
    const conf = {
      data: null,
      style: {},
      altitude: 0.0,
      sizeAttenuation: true,
      ...config
    }

    super(conf)

    this.initData(conf.data)
    
  }

  onReady() {
    this.scene.add(this._group)
    this.initMaterials()
    this.initLines()    
  }

  initData(geoJSON) {  
    // 深度复制一份数据避免干扰
    const features = JSON.parse(JSON.stringify(geoJSON?.features))
    const arr = features.map(item => {
      return {
        coordinates: this.customCoords.lngLatsToCoords(item?.geometry?.coordinates[0]),
        properties: item?.properties
      }
    })

    this._data = arr
  }

  /**
   * 据styles声明生成对应的LineMaterial
   * @private
   */
  initMaterials() {
    const { styles } = this._conf

    Object.keys(styles).forEach(key => {
      const { color, lineWidth } = styles[key]
      const material = new LineMaterial({
        color: color,
        linewidth: lineWidth * 0.001,
        dashed: false,//虚线
        // alphaToCoverage: true, //抗锯齿
        // resolution: new THREE.Vector2(window.innerWidth, window.innerHeight) //抗锯齿
      })
      this._materialMap[key] = material
    })
  }

  /**
   * 创建路径实体
   * @private
   */
  initLines() {
    const { _group, _data } = this

    _data.forEach((feature, index) => {

      const positions = []

      feature.coordinates.forEach(([x, y, z]) => {
        positions.push(x, y, z ?? this._conf.altitude)
      })

      // 使用LineGeometry
      const geometry = new LineGeometry()
      geometry.setPositions(positions)

      // 根据配置获取材质
      const material = this._materialMap[this._conf.getStyle(feature)]

      // 使用Line2 可以设定线条粗细
      const line = new Line2(geometry, material)
      line.computeLineDistances()
      line.scale.set(1, 1, 1)

      _group.add(line)
    })

  }

  /**
   * 设置数据
   * @param {geoJSON} data 数据
   */
  setData(data){
    this.initData(data)

    this.clear()
    this.initLines()
  }

  // 清除
  clear(){
    this._group.clear()
  }

  // 更新
  update() {
  }
}

export default PathLayer
