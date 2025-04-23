import Layer from './core/Layer'
import LayerManager from './core/LayerManager'
import BorderLayer from './layers/BorderLayer'
import BuildingLayer from './layers/BuildingLayer'
import MonoBuildingLayer from './layers/MonoBuildingLayer'
import CakeLayer from './layers/CakeLayer'
import ModelLayer from './layers/ModelLayer'
import MassModelLayer from './layers/MassModelLayer'
import FlowlineLayer from './layers/FlowlineLayer'
import IconLayer from './layers/IconLayer'
import PointIconLayer from './layers/PointIconLayer'
import PointsLayer from './layers/PointsLayer'
import ScatterLayer from './layers/ScatterLayer'
import SpriteLayer from './layers/SpriteLayer'
import TilesLayer from './layers/TilesLayer'
import WaterLayer from './layers/WaterLayer'
import TerrainLayer from './layers/TerrainLayer2'
import DrivingLayer from './layers/DrivingLayer'
import PolylineEditor from './layers/PolylineEditor'
import WeatherLayer from './layers/WeatherLayer'
import VideoLayer from './layers/VideoLayer'
import POI3dLayer from './layers/POI3dLayer'
import EffectLayer from './layers/EffectLayer'
import PolygonLayer from './layers/PolygonLayer'
import GlowPolygonLayerCanvas from './layers/GlowPolygonLayer-canvas'
import GlowPolygonLayerShader from './layers/GlowPolygonLayer-shader'
import TerrainPolygonLayer from './layers/TerrainPolygonLayer'
import HaloLayer from './layers/HaloLayer'
import MaskLayer from './layers/MaskLayer'
import PictureLayer from './layers/PictureLayer'
import PathLayer from './layers/PathLayer'

const GLlayers = {
  Layer,
  LayerManager,
  BorderLayer,
  BuildingLayer,
  MonoBuildingLayer,
  CakeLayer,
  ModelLayer,
  MassModelLayer,
  PathLayer,
  FlowlineLayer,
  IconLayer,
  PointIconLayer,
  PointsLayer,
  ScatterLayer,
  SpriteLayer,
  TilesLayer,
  WaterLayer,
  TerrainLayer,
  DrivingLayer,
  PolylineEditor,
  WeatherLayer,
  VideoLayer,
  POI3dLayer,
  EffectLayer,
  PolygonLayer,
  GlowPolygonLayerCanvas,
  GlowPolygonLayerShader,
  TerrainPolygonLayer,
  HaloLayer,
  MaskLayer,
  PictureLayer
}
window.GLlayers = GLlayers

export default GLlayers
