/* global overpassFrontend:false */
var OverpassFrontend = require('overpass-frontend')
var SharedRouteWay = require('./SharedRouteWay')
var StopArea = require('./StopArea')
var OpeningHours = require('opening_hours')

function Route (ptmap, object) {
  this.ptmap = ptmap
  this.object = object

  this.id = this.object.id
  this.routeType = this.object.tags.route
}

Route.prototype.title = function () {
  if ('name' in this.object.tags) {
    return this.object.tags.name
  }

  if ('ref' in this.object.tags && 'to' in this.object.tags) {
    return this.object.tags.ref + " " + this.object.tags.to
  }

  if ('ref' in this.object.tags) {
    return this.object.tags.ref
  }

  return 'unknown'
}

Route.prototype.ref = function () {
  if ('ref' in this.object.tags) {
    return this.object.tags.ref
  }

  return 'unknown'
}

Route.prototype.isActive = function () {
  if (!this.openingHours) {
    var oh = '05:00-00:00'

    if ('opening_hours' in config.default_tags) {
      oh = config.default_tags.opening_hours
    }

    if (this.object.tags.opening_hours) {
      oh = this.object.tags.opening_hours
    }

    // TODO: also pass nominatim_object to get correct holidays etc
    try {
      this.openingHours = new OpeningHours(oh, {
        address: config.nominatim_address
      })
    } catch (e) {
      this.errors.push("Error parsing opening hours string: " + e)
      return true
    }
  }

  return this.openingHours.getState(this.ptmap.env.date());
}

Route.prototype.routeWays = function (bbox, callback) {
  var wayIds = []
  var wayIndexList = []
  var wayIndex = 0
  var init = false

  if (typeof this._routeWays === 'undefined') {
    this._routeWays = []
    init = true
  }

  for (var i = 0; i < this.object.members.length; i++) {
    var member = this.object.members[i]

    if (member.type === 'way' && ['', 'forward', 'backward'].indexOf(member.role) !== -1) {
      if (init) {
        this._routeWays.push({
          role: member.role,
          wayId: member.id,
          way: false,
          sharedRouteWay: null,
          routeId: this.id,
          route: this,
          dir: null,
          prevWay: null,
          prevConnected: null,
          nextWay: null,
          nextConnected: null
        })
      }

      if (!this._routeWays[wayIndex].way) {
        wayIds.push(member.id)
        wayIndexList.push(wayIndex)
      }

      wayIndex++
    }
  }

  overpassFrontend.get(wayIds,
    {
      bbox: bbox,
      properties: OverpassFrontend.GEOM | OverpassFrontend.MEMBERS
    },
    function (wayIndexList, err, result, index) {
      wayIndex = wayIndexList[index]

      if (result !== false && result !== null) {
        this._routeWays[wayIndex].way = result
        this.routeWayCheck(wayIndex)
      }
    }.bind(this, wayIndexList),
    function (err) {
      callback(err, this._routeWays)
    }.bind(this)
  )
}

Route.prototype.routeWayCheck = function (wayIndex) {
  var link = this._routeWays[wayIndex]

  if (link.prevWay && link.nextWay) {
    return // already checked
  }

  if (!link.sharedRouteWay) {
    link.sharedRouteWay = this.ptmap.sharedRouteWays.get(link.way)
    link.sharedRouteWay.addLink(link)
  }

  var checkPrevWay = false
  if (!link.prevWay && wayIndex > 0) {
    link.prevWay = this._routeWays[wayIndex - 1].way
    checkPrevWay = !!link.prevWay
  }

  var checkNextWay = false
  if (!link.nextWay && wayIndex < this._routeWays.length - 1) {
    link.nextWay = this._routeWays[wayIndex + 1].way
    checkNextWay = !!link.nextWay
  }

  if (checkPrevWay) {
    link.prevConnected = true
    if (link.prevWay.members[0].id === link.way.members[0].id ||
        link.prevWay.members[link.prevWay.members.length - 1].id === link.way.members[0].id) {
      link.dir = 'forward'
    } else if (link.prevWay.members[0].id === link.way.members[link.way.members.length - 1].id ||
        link.prevWay.members[link.prevWay.members.length - 1].id === link.way.members[link.way.members.length - 1].id) {
      link.dir = 'backward'
    } else {
      link.prevConnected = false
    }

    if (link.prevConnected) {
      this.routeWayCheck(wayIndex - 1)
    }
  }

  if (checkNextWay) {
    link.nextConnected = true
    if (link.nextWay.members[0].id === link.way.members[0].id ||
        link.nextWay.members[link.nextWay.members.length - 1].id === link.way.members[0].id) {
      link.dir = 'backward'
    } else if (link.nextWay.members[0].id === link.way.members[link.way.members.length - 1].id ||
        link.nextWay.members[link.nextWay.members.length - 1].id === link.way.members[link.way.members.length - 1].id) {
      link.dir = 'forward'
    } else {
      link.nextConnected = false
    }

    if (link.nextConnected) {
      this.routeWayCheck(wayIndex + 1)
    }
  }

  link.sharedRouteWay.requestUpdate()
}

Route.prototype.stops = function (bbox, callback) {
  var i

  if (!this._stops) {
    this._stops = []

    for (i = 0; i < this.object.members.length; i++) {
      var member = this.object.members[i]

      if (member.type === 'node' && member.role === 'stop') {
        this._stops.push({
          role: member.role,
          nodeId: member.id,
          node: false,
          routeId: this.id,
          route: this
        })
      }
    }
  }

  var nodeIds = []
  var nodeIndexList = []
  for (i = 0; i < this._stops.length; i++) {
    if (this._stops[i].node === false) {
      nodeIds.push(this._stops[i].nodeId)
      nodeIndexList.push(i)
    }
  }

  var param = {
    properties: OverpassFrontend.GEOM | OverpassFrontend.TAGS
  }
  if (bbox) {
    param.bbox = bbox
  }

  overpassFrontend.get(
    nodeIds,
    param,
    function (nodeIndexList, err, result, index) {
      var nodeIndex = nodeIndexList[index]

      if (result !== false && result !== null) {
        this._stops[nodeIndex].node = result
        this.stopCheck(nodeIndex)
      }
    }.bind(this, nodeIndexList),
    function (err) {
      callback(err, this._stops)
    }.bind(this)
  )
}

Route.prototype.stopCheck = function (nodeIndex) {
  var link = this._stops[nodeIndex]

  // analyze stop; add to stop area
  this.ptmap.stopAreas.add(link)
}

// Factory
Route.factory = function (ptmap) {
  var routes = {}

  return {
    add: function (object) {
      if (!(object.id in routes)) {
        routes[object.id] = new Route(ptmap, object)
      }

      return routes[object.id]
    },
    all: function () {
      return routes
    },
    get: function (ids, featureCallback, finalCallback) {
      if (typeof ids === 'string') {
        ids = [ ids ]
      }

      var filter = {
        onlyActive: false
      }

      overpassFrontend.get(
        ids,
        {
          properties: OverpassFrontend.TAGS | OverpassFrontend.MEMBERS | OverpassFrontend.BBOX
        },
        _loadRoute.bind(this, filter, featureCallback),
        function (err) {
          finalCallback(err)
        }
      )
    },

    query: function (filter, featureCallback, finalCallback) {
      var query = []
      for (var type in config.routes) {
        query.push(overpassFrontend.regexpEscape(type))
      }

      if (!('onlyActive' in filter)) {
        filter.onlyActive = true
      }

      overpassFrontend.BBoxQuery(
        'relation[type=route][route~"^(' + query.join('|') + ')$"]',
        filter.bbox,
        {
          properties: OverpassFrontend.TAGS | OverpassFrontend.MEMBERS | OverpassFrontend.BBOX
        },
        _loadRoute.bind(this, filter, featureCallback),
        function (err) {
          finalCallback(err)
        }
      )
    }
  }

  // internal function _loadRoute
  function _loadRoute (filter, featureCallback, err, result) {
    if (err) {
      console.log('Error should not happen')
      return
    }

    var route = this.add(result)

    if (filter.onlyActive && !route.isActive()) {
      return
    }

    featureCallback(null, route)
  }

}

module.exports = Route
