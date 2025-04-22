import BaseUtils from './BaseUtils';

/**
 * 农作物图标图层
 */
class CropLayer extends BaseUtils {
    data = [];
    markers = [];
    id = null
    layer = null

    iconMap = {
        '香蕉': { icon: 'xiangjiao.png', style: 0},
        '火龙果': { icon: 'huolongguo.png', style: 1},
        '番石榴': { icon: 'fanshiliu.png', style: 2},
        '葡萄': { icon: 'putao.png', style: 3},
        '红薯': { icon: 'hongshu.png', style: 4},
        '草鱼': { icon: 'yu.png', style: 5},
        '鲢鱼': { icon: 'yu.png', style: 6},
        '鲈鱼': { icon: 'yu.png', style: 7},
        '虾': { icon: 'xia.png', style: 8},
        '河蟹': { icon: 'xie.png', style: 9},
    }

    constructor(config) {
        super(config);

        this.getData(config.data);
        this.map = config.map;
        this.zooms = config.zooms ?? [10, 22];
        this._zIndex = config.zIndex
        this.id = config.id

        this.init();
    }

    /**
     * 处理具体的图层显示逻辑
     * @param val
     */
    _handleVisible(val) {
        const {layer} = this;
        const fn = val ? 'show' : 'hide';

        if(layer){        
            layer[fn]()
        }
    }

    // 整理数据
    getData(geoJSON) {
        const arr  = []
        const {iconMap} = this

        geoJSON.features.forEach(item=>{
            const {geometry, properties} = item
            const {crop} = properties
            const match = iconMap[crop]
            const [lng, lat] =  geometry.coordinates

            if(match){            
                arr.push({
                    lnglat:  [lng, lat, 50],
                    crop,
                    style: match.style
                })
            }
        })
        this.data = arr
    }

    async init() {

        const {data, map, iconMap, zooms, _zIndex} = this;

        const style = Object.keys(this.iconMap).map(key=>{
            const {icon, style} = iconMap[key]
            return {
                url: `./static/icons/${icon}`,
                size: new AMap.Size(30,30),
                name: key
            }
        })
        
        const layer = new AMap.MassMarks(data, {
            opacity: 1,
            zIndex: _zIndex,
            cursor: 'pointer',
            style,
            zooms
        });
        layer.setMap(map)

        layer.on('mouseover',  (e) => {
            this.dispatchEvent('mouseover', e)
        });
    

        this.layer = layer
        this.visible = true;
    }

    destroy() {
        for (let i = 0; i < this.markers.length; i++) {
            this.markers[i].setMap(null);
        }
        this.markers = [];
    }


}
export default CropLayer;
