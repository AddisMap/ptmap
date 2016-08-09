var current_route_ids = {};
var current_route_count = 0;
var current_sections = [];
var check_update_map_active = false;
var check_update_map_requested = false;

function check_update_map() {
  if(check_update_map_active) {
    check_update_map_requested = true;
    return;
  }

  check_update_map_active = true;
  check_update_map_requested = false;

  get_routes(function(err, routes) {

    if(routes.length != current_route_count) {
      current_route_ids = {};

      for(var i = 0; i < routes.length; i++) {
	current_route_ids[routes[i].id] = true;
      }

      current_route_count = routes.length;
    }
    else {
      var new_route_ids = {};
      var change = false;

      for(var i = 0 ; i < routes.length; i++) {
	new_route_ids[routes[i].id] = true;
	if(!(routes[i].id in current_route_ids))
	  change = true;
      }

      if(!change) {
	check_update_map_active = false;
	if(check_update_map_requested)
	  check_update_map();

	return;
      }

      current_route_count = routes.length;
    }

    update_map(routes, function(err, sections) {
      for(var i = 0; i < current_sections.length; i++) {
	current_sections[i].remove();
      }

      current_sections = sections;

      check_update_map_active = false;
      if(check_update_map_requested)
	check_update_map();
    });
  });
}