var OverpassFrontend = require('overpass-frontend')
var async = require('async')
var moment = require('moment')
var events = require('events')
/* global overpassFrontend */

var Route = require('./Route')
var SharedRouteWay = require('./SharedRouteWay')
var StopArea = require('./StopArea')
var BoundingBox = require('boundingbox')
var Environment = require('./Environment')

function PTMap (map, env) {
  events.EventEmitter.call(this)

  this.map = map
  if (env) {
    this.env = env
  } else {
    this.env = new Environment()
  }
  this.env.on('updateMinute', this.checkUpdateMap.bind(this))

  this.currentStopAreas = []
  this.currentSharedRouteWays = []
  this.loadingState = 0
  this.updateMapRequested = false
  this.highlight = null

  this.routes = Route.factory(this)
  this.sharedRouteWays = SharedRouteWay.factory(this)
  this.stopAreas = StopArea.factory(this)

  if (this.map) {
    this.map.createPane('stopArea')
    this.map.getPane('stopArea').style.zIndex = 401

    this.map.on('moveend', function (e) {
      this.checkUpdateMap()
    }.bind(this))

    this.map.on('popupopen', function (e) {
      if ('object' in e.popup && 'getUrl' in e.popup.object) {
        this.highlight = e.popup.object
        this.updateState(e.popup.object.getUrl())
      }
    }.bind(this))
    this.map.on('popupclose', function (e) {
      if (this.closeOverride) {
        this.closeOverride = false
        return
      }

      this.updateState({})

      if (this.highlight) {
        this.highlight.close()
        this.highlight = null
      }
    }.bind(this))
    this.state = {}

    async.setImmediate(function () {
      this.checkUpdateMap()
    }.bind(this))
  }
}

PTMap.prototype.__proto__ = events.EventEmitter.prototype

PTMap.prototype.getState = function () {
  var ret = JSON.parse(JSON.stringify(this.state))

  ret.zoom = this.map.getZoom()
  ret.lat = this.map.getCenter().lat.toFixed(5)
  ret.lon = this.map.getCenter().lng.toFixed(5)
  ret.date = moment(this.env.date()).format()

  return ret
}

PTMap.prototype.setState = function (state) {
  if ('lat' in state && 'lon' in state && 'zoom' in state) {
    this.map.setView([ state.lat, state.lon ], state.zoom)
  } else if ('lat' in state && 'lon' in state) {
    this.map.panTo([ state.lat, state.lon ])
  } else if ('zoom' in state) {
    this.map.setZoom(state.zoom)
  }

  if ('date' in state) {
    this.env.setDate(state.date)
  }

  if ('stopArea' in state) {
    this.closeOverride = true
    this.map.closePopup()
    this.setLoading()

    this.stopAreas.get(state.stopArea, function (err, ob) {
      if (ob) {
        this.highlight = ob
        ob.open()
      }

      this.unsetLoading()
    }.bind(this))
  }
}

PTMap.prototype.updateState = function (state) {
  this.state = state
  this.emit('updateState', state)
}

PTMap.prototype.setLoading = function () {
  this.loadingState++

  if (typeof document !== 'undefined') {
    var loadingIndicator = document.getElementById('loadingIndicator')
    if (loadingIndicator) {
      loadingIndicator.style.visibility = 'visible';
    }
  }
}

PTMap.prototype.unsetLoading = function () {
  this.loadingState--

  if (typeof document !== 'undefined') {
    var loadingIndicator = document.getElementById('loadingIndicator')
    if (loadingIndicator && this.loadingState <= 0) {
      loadingIndicator.style.visibility = 'hidden';
    }
  }

  if (this.updateMapRequested && this.loadingState <= 0) {
    this.checkUpdateMap()
  }
}

PTMap.prototype.checkUpdateMap = function () {
  if (this.loadingState) {
    this.updateMapRequested = true
    return
  }

  this.updateMapRequested = false

  this.setLoading()

  var filter = {
    bbox: this.map.getBounds()
  }

  async.setImmediate(function () {
    for(var i = 0; i < this.currentSharedRouteWays.length; i++) {
      this.currentSharedRouteWays[i].update()
    }
    for(var i = 0; i < this.currentStopAreas.length; i++) {
      this.currentStopAreas[i].update()
    }
  }.bind(this))

  async.parallel([
    function (callback) {
      var newStopAreas = []

      this.getStopAreas(
        filter,
        function (err, stopArea) {
          newStopAreas.push(stopArea)
          stopArea.show()
        }.bind(this),
        function (err) {
          for (var i = 0; i < this.currentStopAreas.length; i++) {
            if (newStopAreas.indexOf(this.currentStopAreas[i]) === -1) {
              this.currentStopAreas[i].hide(this.map)
            }
          }
          this.currentStopAreas = newStopAreas

          callback()
        }.bind(this)
      )
    }.bind(this),
    function (callback) {
      var newSharedRouteWays = []

      this.getSharedRouteWays(
        filter,
        function (err, sharedRouteWay) {
          newSharedRouteWays.push(sharedRouteWay)
          sharedRouteWay.show()
        }.bind(this),
        function (err) {
          for (var i = 0; i < this.currentSharedRouteWays.length; i++) {
            if (newSharedRouteWays.indexOf(this.currentSharedRouteWays[i]) === -1) {
              this.currentSharedRouteWays[i].hide(this.map)
            }
          }
          this.currentSharedRouteWays = newSharedRouteWays

          console.log('callback sharedroute')
          callback()
        }.bind(this)
      )
    }.bind(this)
  ], function () {
    this.unsetLoading()
  }.bind(this))
}

PTMap.prototype.update = function (force) {
  this.stopAreas.update(force)
  this.sharedRouteWays.update(force)
}

PTMap.prototype.getRouteById = function (ids, featureCallback, finalCallback) {
  return this.routes.get(ids, featureCallback, finalCallback)
}

PTMap.prototype.getRoutes = function (filter, featureCallback, finalCallback) {
  return this.routes.query(filter, featureCallback, finalCallback)
}

PTMap.prototype.getSharedRouteWays = function (filter, featureCallback, finalCallback) {
  var done = {}
  var bbox = new BoundingBox(filter.bbox)
  var stackRoutes = 0
  var finishedRoutes = false

  this.getRoutes(
    filter,
    function (err, route) {
      stackRoutes++

      route.routeWays(
        filter.bbox,
        function (err, routeWay, wayIndex) {
          if (routeWay.wayId in done) {
            return
          }

          if (routeWay.way && routeWay.way.intersects(bbox)) {
            done[routeWay.wayId] = true
            featureCallback(null, routeWay.sharedRouteWay)
          }
        },
        function (err, routeWays) {
          stackRoutes--
          if (stackRoutes === 0 && finishedRoutes) {
            finalCallback(err)
          }
        }
      )
    }.bind(this),
    function (err) {
      finishedRoutes = true
    }
  )
}

PTMap.prototype.getStopAreas = function (filter, featureCallback, finalCallback) {
  var done = []
  var bbox = new BoundingBox(filter.bbox)
  var stackRoutes = 0
  var finishedRoutes = false

  this.getRoutes(
    filter,
    function (err, route) {
      stackRoutes++

      route.stops(
        filter.bbox,
        function (err, stop, stopIndex) {
          if (done.indexOf(stop.stopArea) !== -1) {
            return
          }

          if (stop.node && stop.node.intersects(bbox)) {
            done.push(stop.stopArea)
            featureCallback(null, stop.stopArea)
          }
        },
        function (err, stops) {
          stackRoutes--
          if (stackRoutes === 0 && finishedRoutes) {
            finalCallback(err)
          }
        }
      )
    }.bind(this),
    function (err) {
      finishedRoutes = true
    }
  )
}

module.exports = PTMap
