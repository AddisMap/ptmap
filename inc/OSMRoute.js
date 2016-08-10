OSMRoute.inherits_from(OSMRelation);
function OSMRoute() {
}

OSMRoute.prototype.init = function(data) {
  this.parent("OSMRoute").init.call(this, data);
}

OSMRoute.prototype.route_parts = function(callback) {
  var result = [];
  var route_index = 0;
  var last_route_part = null;
  var last_dir;

  if(this._route_parts)
    return callback(null, this._route_parts);

  async.eachSeries(this.data.members, function(member, callback) {
    var dir = null;

    if(member.type != 'way')
      return callback();
    if(member.role != '')
      return callback();

    get_osm_object('w' + member.ref, function(callback, err, ob) {
      if(last_route_part) {
	if(last_route_part.nodes[0] == ob.nodes[0] ||
	   last_route_part.nodes[last_route_part.nodes.length - 1] == ob.nodes[0])
	  dir = 'forward';

	else if(last_route_part.nodes[0] == ob.nodes[ob.nodes.length - 1] ||
	   last_route_part.nodes[last_route_part.nodes.length - 1] == ob.nodes[ob.nodes.length - 1])
	  dir = 'backward';

	else
	  dir = 'unknown';
      }

      if(last_dir === null) {
	if(last_route_part.nodes[0] == ob.nodes[0] ||
	   last_route_part.nodes[0] == ob.nodes[ob.nodes.length - 1])
	  result[result.length - 1].dir = 'backward';

	else if(last_route_part.nodes[last_route_part.nodes.length - 1] == ob.nodes[0] ||
	   last_route_part.nodes[last_route_part.nodes.length - 1] == ob.nodes[ob.nodes.length - 1])
	  result[result.length - 1].dir = 'forward';

	else
	  result[result.length - 1].dir = 'unknown';
      }

      result.push({
	member: ob,
	link: {
	  route: this,
	  member_id: ob.id,
	  role: member.role,
	  dir: dir,
	  route_index: route_index++
	}
      });

      last_route_part = ob;
      last_dir = dir;

      callback();
    }.bind(this, callback));
  }.bind(this), function() {
    if(last_dir === null)
      result[result.length - 1].dir = 'unknown';

    this._route_parts = result;

    callback(null, result);
  }.bind(this));
}
