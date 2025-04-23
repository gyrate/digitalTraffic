import Config from '../Config'
import AMapLayer from './AMap'
import TMapLayer from './TMap'
// todo: 调整为不需要安装arcGIS包也可以用npm
// import ArcGISLayer from './ArcGIS'

// 获取全局配置
const { mapType } = Config

// 选择对应的基础图层类
let Layer = null
if (mapType === 'AMap') {
  Layer = AMapLayer
} else if (mapType === 'ArcGIS') {
  Layer = AMapLayer
} else if (mapType === 'TMap') {
  Layer = TMapLayer
}

export default Layer
