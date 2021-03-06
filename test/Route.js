// dependencies
var fs = require('fs')
var OverpassFrontend = require('overpass-frontend')
var assert = require('assert')
var async = require('async')

// sources
var StopArea = require('../src/StopArea')
var Route = require('../src/Route')
var SharedRouteWay = require('../src/SharedRouteWay')

// setup
global.config = JSON.parse(fs.readFileSync('test/conf.json', 'utf8'))
global.overpassFrontend = new OverpassFrontend(config.overpass.url, config.overpass)

var PTMap = require('../src/PTMap')
var ptmap = new PTMap()

ptmap.routes = Route.factory(ptmap)
ptmap.sharedRouteWays = SharedRouteWay.factory(ptmap)
ptmap.stopAreas = StopArea.factory(ptmap)

describe('Route', function () {
  it('.get()', function (done) {
    var tests = {
      'r910886': {
      },
      'r1234': null,
      'w183723744': null,
      'n1941351811': null,
      'Westbahnhof,48.1963,16.3387': null,
      'r1980077': null
    }

    async.eachOf(
      tests,
      function (expected, id, callback) {
        ptmap.routes.get(
          id,
          {},
          function (err, actual) {
            if (expected === null) {
              assert.equal(actual, null, id + ': Object should not exist!')
              callback(err)
              return
            }
            
            assert.equal(actual.id, id, id + ': Wrong ID returned!')
            callback(err)
          }
        )
      },
      function (err) {
        done(err)
      }
    )
  })

  it('.stops(ids)', function (done) {
    var tests = {
      'r910886': {
        'test': [ 'n2293994066' ],
        'expected': [ 'n2293994066' ]
      },
    }

    async.eachOf(
      tests,
      function (expected, id, callback) {
        ptmap.routes.get(
          id,
          {},
          function (err, actual) {
            var test = tests[actual.id]

            actual.stops(
              {
                ids: test.test
              },
              function (err, actual, index) {
                assert.equal(actual.id, test.expected[index], 'wrong id returned')
              },
              function (err) {
                callback(err)
              }
            )
          }
        )
      },
      function (err) {
        done(err)
      }
    )
  })

  it('.getStop()', function (done) {
    var tests = {
      'r910886': [
        { id: 'n2293994066', index: 15 }
      ]
    }

    async.eachOf(
      tests,
      function (expected, id, callback) {
        ptmap.routes.get(
          id,
          {},
          function (err, actual) {
            var test = tests[actual.id]

            async.each(test,
              function (t, callback) {
                actual.getStop(t.id,
                  function (err, actual, index) {
                    assert.equal(actual.stopId, t.id, 'wrong id returned')
                    assert.equal(actual.stopIndex, t.index, 'wrong index returned')
                    callback()
                  }
                )
              },
              function (err) {
                callback(err)
              }
            )
          }
        )
      },
      function (err) {
        done(err)
      }
    )
  })
})
