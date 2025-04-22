// 展示 港区 码头 等兴趣点
import BaseUtils from './BaseUtils';

class PoiLayer extends BaseUtils {
    data = [];
    markers = [];

    constructor(config) {
        super(config);

        this.getData(config.data);
        this.map = config.map;
        this.zooms = [10, 22];

        this.init();
    }

    /**
     * 处理具体的图层显示逻辑
     * @param val
     */
    _handleVisible(val) {
        const {markers} = this;
        const fn = val ? 'show' : 'hide';
        markers.forEach(item => {
            item[fn]();
        });
    }

    // 整理数据
    getData(geoJSON) {
        this.data = geoJSON.features;
    }

    async init() {

        const {data, map, markers} = this;

        for (let i = 0; i < data.length; i++) {
            const {geometry, properties} = data[i];
            const [lng, lat] = geometry.coordinates;
            const {poiType} = properties;

            let marker = null;
            switch (poiType) {
                case 'portArea':
                    marker = this.createPortMarker([lng, lat], properties);
                    break;
                case 'wharf':
                    marker = this.createWharfMarker([lng, lat], properties);
                    break;
                default:
                    break;
            }
            if (marker) {
                // 给marker绑定事件
                ['mouseover', 'mouseout', 'click'].forEach(eventName => {
                    marker.on(eventName, e => {
                        const position = e.target.getPosition();
                        const data = e.target.getExtData();
                        this.dispatchEvent(eventName, {
                            poiType: data.poiType,
                            position,
                            data
                        });
                    });
                });
                // 添加到地图
                map.add(marker);
                markers.push(marker);
            }
        }
        this.visible = true;

    }

    /**
     * 创建港区标注
     * @param {*} param
     * @param {*} properties
     * @returns
     */
    createPortMarker([lng, lat], properties) {

        const {name, popup} = properties;
        const marker = new AMap.Marker({
            content: `
                    <div class="poi-gq">
                        <div class="poi-gq-m"></div>
                        <div class="poi-gq-l">${name}</div>
                    </div>
                `,
            position: [lng, lat],
            size: [94, 146],
            offset: new AMap.Pixel(-47, -160),
            zooms: [8, 22],
            zIndex: 30,
            extData: {poiType: 'port', ...properties},
            clickable: popup,
            cursor: popup ? 'pointer' : 'default',
            bubble: false //
        });
        return marker;
    }

    destroy() {
        for (let i = 0; i < this.markers.length; i++) {
            this.markers[i].setMap(null);
        }
        this.markers = [];
    }


}
export default PoiLayer;
