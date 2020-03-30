'use-strict'

// base libs
import PropTypes from 'prop-types'
import React, { Component } from 'react'
import {
  Platform,
  Dimensions,
  LayoutAnimation
} from 'react-native'
// map-related libs
import MapView from 'react-native-maps'
import SuperCluster from 'supercluster'
import GeoViewport from '@mapbox/geo-viewport'
// components / views
import ClusterMarker from './ClusterMarker'
// libs / utils
import {
  regionToBoundingBox,
  itemToGeoJSONFeature,
  getCoordinatesFromItem,
  calcZoom,
  generateExtentByCount,
} from './util'

export default class ClusteredMapView extends Component {

  constructor(props) {
    super(props)

    this.state = {
      data: [], // helds renderable clusters and markers
      region: props.region || props.initialRegion, // helds current map region
    }

    this.isAndroid = Platform.OS === 'android'
    this.dimensions = [props.width, props.height]

    this.mapRef = this.mapRef.bind(this)
    this.onClusterPress = this.onClusterPress.bind(this)
    this.onRegionChangeComplete = this.onRegionChangeComplete.bind(this)
  }
  
  shouldComponentUpdate(nextProps, nextState) {
    if (this.props.data && nextProps.data && this.props.data.length !== nextProps.data.length) {
      return true
    }
    if (this.state.data && nextState.data && this.state.data.length !== nextState.data.length) {
      return true
    }
    return false;
  }

  componentDidMount() {
    this.clusterize(this.props.data)
  }
/* 
  UNSAFE_componentWillReceiveProps(nextProps) {
    console.log('updateprops ', nextProps, this.props)
    if (this.props.data !== nextProps.data)
      this.clusterize(nextProps.data)
  } */
  
  componentDidUpdate(prevProps, prevState) {
    if (this.props.data !== prevProps.data) {
      const currentZoom = calcZoom(this.state.region.longitudeDelta);
      this.clusterize(this.props.data, generateExtentByCount(currentZoom, !!this.props.data ? this.props.data.length : 0))
    }
  }
  
  /* componentWillUpdate(nextProps, nextState) {
    if (!this.isAndroid && this.props.animateClusters && this.clustersChanged(nextState))
      LayoutAnimation.configureNext(this.props.layoutAnimationConf)
  } */

  mapRef(ref) {
    this.mapview = ref
  }

  getMapRef() {
    return this.mapview
  }

  getClusteringEngine() {
    return this.index
  }

  clusterize(dataset, extent = this.props.extent, region = this.state.region, cb) {
    this.index = new SuperCluster({ // eslint-disable-line new-cap
      extent: extent,
      minZoom: this.props.minZoom,
      maxZoom: this.props.maxZoom,
      radius: this.props.radius || (this.dimensions[0] * .045), // 4.5% of screen width
      nodeSize: 512,
    })

    // get formatted GeoPoints for cluster
    const rawData = dataset.map(item => itemToGeoJSONFeature(item, this.props.accessor))

    // load geopoints into SuperCluster
    this.index.load(rawData)

    const data = this.getClusters(region)
    this.setState({ data, region }, cb ? () => cb(data) : () => {});
  }

  clustersChanged(newData) {
    return this.state.data.length !== newData.length
  }

  generateClustersByRegion(region) {
    let data = this.getClusters(region);
    this.setState({ region, data }, () => {
    this.props.onRegionChangeComplete && this.props.onRegionChangeComplete(region, data)});
  }

  onRegionChangeComplete(region) {
    const currentZoom = calcZoom(region.longitudeDelta);
    const oldZoom = calcZoom(this.state.region.longitudeDelta);
    const currentExtent = this._getCurrentExtent();
    const newExtent = generateExtentByCount(currentZoom, this._getDataLength());
    if (currentZoom !== oldZoom) {
      if (!!newExtent && currentExtent !== newExtent) {
          this.clusterize(this.props.data, newExtent, region, (data) => {
            this.props.onRegionChangeComplete && this.props.onRegionChangeComplete(region, data)
          })
      } else {
        this.generateClustersByRegion(region);
      }
    } else {
      this.generateClustersByRegion(region);
    }
    
  }

  getClusters(region) {
    const bbox = regionToBoundingBox(region),
          viewport = (region.longitudeDelta) >= 40 ? { zoom: this.props.minZoom } : GeoViewport.viewport(bbox, this.dimensions)

    return this.index.getClusters(bbox, viewport.zoom)
  }

  onClusterPress(cluster) {

    // cluster press behavior might be extremely custom.
    if (!this.props.preserveClusterPressBehavior) {
      this.props.onClusterPress && this.props.onClusterPress(cluster.properties.cluster_id)
      return
    }

    // //////////////////////////////////////////////////////////////////////////////////
    // NEW IMPLEMENTATION (with fitToCoordinates)
    // //////////////////////////////////////////////////////////////////////////////////
    // get cluster children
    const children = this.index.getLeaves(cluster.properties.cluster_id, this.props.clusterPressMaxChildren)
    const markers = children.map(c => c.properties.item)

    const coordinates = markers.map(item => getCoordinatesFromItem(item, this.props.accessor, false))

    // fit right around them, considering edge padding
    this.mapview.fitToCoordinates(coordinates, { edgePadding: this.props.edgePadding })

    this.props.onClusterPress && this.props.onClusterPress(cluster.properties.cluster_id, markers)
  }

  _getDataLength() {
    return this.props.data.length;
  }

  _getCurrentExtent() {
    return this.index.options.extent;
  }

  render() {
    const { style, ...props } = this.props
    return (
      <MapView
        {...props}
        style={style}
        ref={this.mapRef}
        onRegionChangeComplete={this.onRegionChangeComplete}>
        {
          this.props.clusteringEnabled && this.state.data.map((d) => {
            if (d.properties.point_count === 0)
              return this.props.renderMarker(d.properties.item)

            return (
              <ClusterMarker
                {...d}
                onPress={this.onClusterPress}
                renderCluster={this.props.renderCluster}
                key={`cluster-${d.properties.cluster_id}`} />
            )
          })
        }
        {
          !this.props.clusteringEnabled && this.props.data.map(d => this.props.renderMarker(d))
        }
        {this.props.children}
      </MapView>
    )
  }
}

ClusteredMapView.defaultProps = {
  minZoom: 1,
  maxZoom: 16,
  extent: 512,
  accessor: 'location',
  animateClusters: true,
  clusteringEnabled: true,
  clusterPressMaxChildren: 100,
  preserveClusterPressBehavior: true,
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height,
  layoutAnimationConf: LayoutAnimation.Presets.spring,
  edgePadding: { top: 10, left: 10, right: 10, bottom: 10 }
}

ClusteredMapView.propTypes = {
  ...MapView.propTypes,
  // number
  radius: PropTypes.number,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  extent: PropTypes.number.isRequired,
  minZoom: PropTypes.number.isRequired,
  maxZoom: PropTypes.number.isRequired,
  clusterPressMaxChildren: PropTypes.number.isRequired,
  // array
  data: PropTypes.array.isRequired,
  // func
  onExplode: PropTypes.func,
  onImplode: PropTypes.func,
  onClusterPress: PropTypes.func,
  renderMarker: PropTypes.func.isRequired,
  renderCluster: PropTypes.func.isRequired,
  // bool
  animateClusters: PropTypes.bool.isRequired,
  clusteringEnabled: PropTypes.bool.isRequired,
  preserveClusterPressBehavior: PropTypes.bool.isRequired,
  // object
  layoutAnimationConf: PropTypes.object,
  edgePadding: PropTypes.object.isRequired,
  // string
  // mutiple
  accessor: PropTypes.oneOfType([PropTypes.string, PropTypes.func])
}
