var overpass_elements = {};
var overpass_tiles = {};
var overpass_requests = [];
var overpass_request_active = false;

/**
 * @param array|string ids One or more IDs, e.g. [ 'n123', 'w2345', 'n123' ]
 * @param object options
 *                 none defined yet
 * @param function feature_callback Will be called for each object in the order of the IDs in parameter 'ids'. Will be passed: 1. err (if an error occured, otherwise null), 2. the object or null, 3. the index in the array ids.
 * @param function final_callback Will be called after the last feature. Will be passed: 1. err (if an error occured, otherwise null).
 */
function overpass_get(ids, options, feature_callback, final_callback) {
  if(typeof ids == 'string')
    ids = [ ids ];
  if(options === null)
    options = {};

  overpass_requests.push({
    ids: ids,
    options: options,
    feature_callback: feature_callback,
    final_callback: final_callback
  });

  _overpass_process();
}

function _overpass_process() {
  if(overpass_request_active)
    return;

  if(!overpass_requests.length)
    return;

  overpass_request_active = true;
  var todo = {};
  var effort = 0;
  var query = '';
  for(var j = 0; j < overpass_requests.length; j++) {
    if(overpass_requests[j] === null)
      continue;
    var request = overpass_requests[j];
    var ids = request.ids;
    var all_found_until_now = true;

    for(var i = 0; i < ids.length; i++) {
      if(ids[i] === null)
        continue;
      if(ids[i] in overpass_elements) {
        if(all_found_until_now) {
          async.setImmediate(function(ob, i, callback) {
            callback(null, ob, i);
          }.bind(this, overpass_elements[ids[i]], i, request.feature_callback));
          request.ids[i] = null;
        }
        continue;
      }

      all_found_until_now = false;
      if(ids[i] in todo)
        continue;

      // too much data - delay for next iteration
      if(effort > 256)
        continue;

      todo[ids[i]] = true;
      switch(ids[i].substr(0, 1)) {
        case 'n':
          query += 'node(' + ids[i].substr(1) + ');out body;\n';
          effort += 1;
          break;
        case 'w':
          query += 'way(' + ids[i].substr(1) + ');out body geom;\n';
          effort += 4;
          break;
        case 'r':
          query += 'relation(' + ids[i].substr(1) + ');out body bb;\n';
          effort += 16;
          break;
      }
    }

    if(all_found_until_now) {
      async.setImmediate(function(callback) {
        callback(null);
      }.bind(this, request.final_callback));
      overpass_requests[j] = null;
    }
  }

  var p;
  while((p = overpass_requests.indexOf(null)) != -1)
    overpass_requests.splice(p, 1);

  if(query == '') {
    overpass_request_active = false;
    return;
  }

  http_load(
    conf.overpass.url,
    null,
    "[out:json];" + query,
    function(err, results) {
      for(var i = 0; i < results.elements.length; i++) {
        var el = results.elements[i];
        var id = el.type.substr(0, 1) + el.id;
        overpass_elements[id] = create_osm_object(el);
      }

      for(var id in todo) {
        if(!(id in overpass_elements))
          overpass_elements[id] = null;
      }

      overpass_request_active = false;

      _overpass_process();
   }
 );
}

function overpass_query(query, bounds, callback) {
  var ret = [];
  var bbox_string = bounds.toBBoxString();
  bbox_string = bbox_string.split(/,/);
  bbox_string = bbox_string[1] + ',' + bbox_string[0] + ',' +
                bbox_string[3] + ',' + bbox_string[2];

  http_load(
    conf.overpass.url,
    null,
    "[out:json][bbox:" + bbox_string + "];" + query + "out ids bb;",
    function(err, results) {
      var todo = [];
      var todo_ids = {};

      for(var i = 0; i < results.elements.length; i++) {
	var el = results.elements[i];
	var id = el.type.substr(0, 1) + el.id;

	if(id in overpass_elements) {
	  ret.push(overpass_elements[id]);
	}
	else {
	  todo_ids[id] = {};
	  todo.push(el.type + '(' + el.id + ');');
	}
      }

      if(todo.length) {
	http_load(
	  conf.overpass.url,
	  null,
	  '[out:json];((' + todo.join('') + ');)->.i;out bb body;', //node(r.i);out body;', //way(r.i);out body geom;',
	  function(err, results) {
	    for(var i = 0; i < results.elements.length; i++) {
	      var el = results.elements[i];
	      var id = el.type.substr(0, 1) + el.id;

	      overpass_elements[id] = create_osm_object(el);

	      if(id in todo_ids) {
		ret.push(overpass_elements[id]);
		delete(todo_ids[id]);
	      }
	    }

	    callback(null, ret);
	  }
	);
      }
      else {
	callback(null, ret);
      }
    }
  );
}

function overpass_regexp_escape(s) {
  return s.replace('\\', '\\\\')
       .replace('.', '\\.')
       .replace('|', '\\|')
       .replace('[', '\\[')
       .replace(']', '\\]')
       .replace('(', '\\(')
       .replace(')', '\\)')
       .replace('{', '\\{')
       .replace('}', '\\}')
       .replace('?', '\\?')
       .replace('+', '\\+')
       .replace('*', '\\*')
       .replace('^', '\\^')
       .replace('$', '\\$');
}
