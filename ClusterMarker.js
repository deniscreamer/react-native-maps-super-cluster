'use-strict'

// base libs
import PropTypes from 'prop-types'
import React, { Component } from 'react'

export default class ClusterMarker extends Component {
  constructor(props) {
    super(props)

    this.onPress = this.onPress.bind(this)
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextProps.type !== this.props.type) {
      return true;
    }
    if (nextProps.id !== this.props.id) {
      return true;
    }
    return false;
  }

  onPress() {
    this.props.onPress(this.props)
  }

  render() {
    const clusterId = this.props.properties.cluster_id;
    const pointCount = this.props.properties.point_count; // eslint-disable-line camelcase
    const [longitude, latitude] = this.props.geometry.coordinates;
    const adsId = this.props.getAdsByClusterId(clusterId, pointCount);
    
    if (this.props.renderCluster) {
      const cluster = {
        pointCount,
        coordinate: { latitude, longitude },
        clusterId,
        adsId
      }
      return this.props.renderCluster(cluster, this.onPress)
    }

    throw "Implement renderCluster method prop to render correctly cluster marker!"
  }
}

ClusterMarker.propTypes = {
  renderCluster: PropTypes.func,
  onPress: PropTypes.func.isRequired,
  geometry: PropTypes.object.isRequired,
  properties: PropTypes.object.isRequired,
}
