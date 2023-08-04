/*
  Dynamic OpenDTU Limit Management with Shelly Gen.2
  04.08.2023, gf78
*/


// Configuration
let config = {
  enabled: true,             // activate limit mgmt on startup?
  dtu: {                      // OpenDTU
    ip: "10.0.0.xxx",
    user: "admin",
    password: "secret",
    inverter: 0,              // index of inverter, 0 for first
    min_limit: 800,           // watts
    max_limit: 1500,          // watts
    limit_step: 50            // watts
  },
  shelly: {
    type: null,               // component type: EM or Switch or null for auto
    id: 0,                    // component id, default = 0
  },
  grid: {
    min_power: -700            // e.g. -700 ... 0 watts
  },
  timer: {
    seconds: 30                // interval to manage limit
  }  
}



// Flow: Interval Timer > enabled? > getDtuData > getMeterData > manageLimit > setDtuLimit


// Get current power (EM)
function getPowerEM() {
  let data = Shelly.getComponentStatus("EM", config.shelly.id || 0);
  if(data && typeof data === "object" && typeof data.total_act_power === "number") {
    return {
      power: Math.round(data.total_act_power || 0), // only one phase? select: a_act_power, b_act_power or c_act_power
      error: false
      };
  } else {
    return {
      power: 0,
      error: true
      };  
  }
}

// Get current power (Switch)
function getPowerSwitch() {
  let data = Shelly.getComponentStatus("Switch", config.shelly.id || 0);
  if(data && typeof data === "object" && typeof data.aenergy === "object" && typeof data.aenergy.total  === "number") {
    return {
      power: Math.round(data.aenergy.total || 0),
      error: false
      };
  } else {
    return {
      power: 0,
      error: true
      };  
  }
}


// Get act power from this shelly
function getMeterData(dtu) {

  let meter;

   if(config.shelly.type === "EM") {
     meter = getPowerEM();
   }  if(config.shelly.type === "Switch") {
     meter = getPowerSwitch();
   } else {    
       meter = getPowerEM();
       if(meter.error) {
         meter = getPowerSwitch();
       }
   }
   
   if(meter.error) {
      print("ERROR: Can not retrieve grid power.");
      return;
    }
   
   let data = {
       dtu: dtu,
       meter: {
         power: meter.power
       }
   }   
   manageLimit(data);
}



// Get current DTU data and trigger manage limit
function getDtuData() {
  Shelly.call(
      'HTTP.GET',
      {
		url: "http://" + config.dtu.user + ":" + config.dtu.password + "@" +  config.dtu.ip +"/api/livedata/status",
		timeout: 30,
        ssl_ca: "*"
      },
		  function (result, error_code, error_message, user_data) {		
    	if(typeof result === "object" &&
    		typeof result.code === "number" &&
    		(result.code === 204 || result.code === 200) && 
            typeof result.body === "string"
    	){
    		let dtu = JSON.parse(result.body);
    
            if(!(dtu.inverters[config.dtu.inverter].reachable || false)) {
              print("INFO: DTU is not reachable.");
              return;
            }
      
            let data = {
                  serial: dtu.inverters[config.dtu.inverter].serial || null,     
                  power:  Math.round(dtu.inverters[config.dtu.inverter].AC[0].Power.v || 0, 0),
                  limit: Math.round(dtu.inverters[config.dtu.inverter].limit_absolute || 0)
            };   
    
            getMeterData(data);   
            
	        } else {
          print("ERROR. Could not retrieve DTU data. ("+ result.message + ")")
        }
      }
    );		      
}


// Set new DTU limit
function setDtuLimit(serial, limit) {
  Shelly.call(
    'HTTP.POST',
    {
      url: "http://" + config.dtu.user + ":" + config.dtu.password + "@" +  config.dtu.ip +"/api/limit/config",										
      body: "data={\"serial\":\"" + serial + "\",\"limit_type\":0,\"limit_value\":" + limit + "}",
      content_type: "application/x-www-form-urlencoded",
      ssl_ca: "*",
	  timeout: 30,
    },
	function (result, error_code, error_message, user_data) {		
       if(typeof result === "object" &&
	       typeof result.code === "number" &&
	       (result.code === 204 || result.code === 200)) {
	          print("OK. Limit set to " + limit + "W.");
	   } else {
        print("ERROR. Could not set limit set to " + limit + "W.");
      }
    } 
  );		
}


// manage limit
function manageLimit(data) {
   
    print("Grid: " + data.meter.power + "W, Solar: " + data.dtu.power + "W, (Limit: "+ data.dtu.limit + "W)");
  
    /* potential improvements: 
    
          - moving average of power measurements
          - increase/decrease limit in steps          
    */
          
    let production_potential = data.meter.power - config.grid.min_power; // pos: increase limit, neg: decrease limit;
    let new_limit = Math.max(Math.min(Math.round((data.dtu.limit + production_potential) / config.dtu.limit_step,0) * config.dtu.limit_step, config.dtu.max_limit), config.dtu.min_limit);
  
    if(data.dtu.limit !== new_limit) {
      print("Info: Set limit to: " + new_limit + "W");
      setDtuLimit(data.dtu.serial, new_limit);
    } else {
        print("Info: Current limit is OK");
    }
}


// JSON response for http rest api
function httpJSONHandler(response, data, code) {
	response.code = typeof code === "number" ? code : 200;
	response.headers = [ 
		["Content-Type", "application/json"], 
		["Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"],
		["X-Robots-Tag", "noindex, nofollow"]
	];
	if(typeof data !== "undefined") {
		response.body = JSON.stringify(data);
	}
	response.send();
}

// print api urls
function printUrlHint() {
	Shelly.call(
		"wifi.getstatus",
		{},
		function (result, error_code, error_message, user_data) {
			if (error_code === 0) {
				if(typeof result !== "unkown" &&
					typeof result.sta_ip !== "unkown"
				) {  					
                    let base_url = "http://" + result.sta_ip + "/script/" + Shelly.getCurrentScriptId() + "/";
                    print("Web: " + base_url);
                    print("API Status: " + base_url + "api/status");
                    print("API Start: " + base_url + "api/start");
                    print("API Stop: " + base_url + "api/stop");
				}
			}
		}
	);
}


// Main
function main() {

  print("Starting.... (enabled: " + config.enabled + ")");
  printUrlHint();

  // Mini Website
  HTTPServer.registerEndpoint("", function(request, response){
    print("WEB: Home accessed (query: " + request.query + ")")   
    
    // change status
    if(request.query) {
      if(request.query === "enabled=0" ) {
          config.enabled = false;
      } else  if(request.query === "enabled=1" ) {
          config.enabled = true;
      }
    }      
    
    // respond 
    response.code = 200;
	response.headers = [ 
		["Content-Type", "text/html"], 
		["Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"],
		["X-Robots-Tag", "noindex, nofollow"]
	];
	response.body = "<html><head>" +
                    "<title>Dyn. Limit Mgmt.</title>" + 
                    "<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1'>" +
                    "</head>" +
                    "<body style='text-align:center;'>" +
                    "<h2>Dyn. Limit Mgmt.</h2>" + 
                    "<p>Status: <strong>" + (config.enabled ? "Enabled" : "Disabled") + "</strong></p>" +
                    (config.enabled 
                      ? "<a href='?enabled=0'><button>Disable</button></a>&nbsp;" 
                       :"<a href='?enabled=1'><button>Enable</button></a>") +
                    "</body></html>";	
	response.send();
  });  

  // REST API                       
  HTTPServer.registerEndpoint("api/status", function(request, response){
    print("API: Status requested")    
    httpJSONHandler(response,{enabled: config.enabled});
  });  
  HTTPServer.registerEndpoint("api/start", function(request, response){
    config.enabled = true;
    print("API: Enabled limit management")    
    httpJSONHandler(response,{enabled: config.enabled});
  });
  HTTPServer.registerEndpoint("api/stop", function(request, response){
    config.enabled = false;
    print("API: Disabled limit management")   
    httpJSONHandler(response,{enabled: config.enabled});
  });
  
  // Interval timer to manage the limit
  let timer = Timer.set(config.timer.seconds * 1000, true, 
    function() {
      if(config.enabled) {
        getDtuData();
      }
    }  
  );
}



// Run
main();
