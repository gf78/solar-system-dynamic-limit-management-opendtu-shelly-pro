/*
  DYNAMIC LIMIT MANAGEMENT (ULTRA-LIGHT-VERSION)
  Shelly 3EM Pro & OpenDTU
  06.08.2023, GF78
*/

var DTU_IP = "xxx.xxx.xxx.xxx";
var DTU_PWD = "secret";
var PHASE = "total"; // total, a, b, c
var GRID = -700;
var INTERVAL = 60; // sec
var LIMIT_MIN = 800;
var LIMIT_MAX = 1500;
var LIMIT_STEP_MIN = 50;
var LIMIT_STEP_MAX = 100;
var LIMIT_ROUND = 50;

Timer.set((INTERVAL || 60) * 1000, true,
	function () {			
		Shelly.call('HTTP.GET', { url: "http://admin:" + DTU_PWD + "@" + DTU_IP + "/api/livedata/status", timeout: 15, ssl_ca: "*" },
			function(result) {
				
				//DTU	
				if (typeof result !== "object" || typeof result.code !== "number" || result.code !== 200 || typeof result.body !== "string") {
					print("ERROR: No DTU data.");
					return;				
				}
				let dtu = JSON.parse(result.body);
				if (!(dtu.inverters[CONFIG.dtu.inverter || 0].reachable || false)) {
					print("INFO: DTU is not reachable.");
					return;
				}
				let dtu_limit = Math.round(dtu.inverters[0].limit_absolute || 0);
				
				// Shelly
				let shelly = Shelly.getComponentStatus("EM", 0);	
				if (!shelly || typeof shelly !== "object" || typeof shelly[PHASE + "_act_power"] !== "number") {
					print("ERROR: Unkown shelly power unkown");
					return;
				} 
				let shelly_power = Math.round(shelly[PHASE + "_act_power"] || 0);

				// Limit
				let limit = dtu_limit + shelly_power - GRID;
				limit = Math.max(limit, LIMIT_MIN, 0); 
				limit = Math.min(limit, LIMIT_MAX);
				limit = Math.abs(dtu_limit - limit) < LIMIT_STEP_MIN ? dtu_limit : limit;
				limit = Math.abs(dtu_limit - limit) > LIMIT_STEP_MAX 
						? limit > dtu_limit ? dtu_limit + LIMIT_STEP_MAX : dtu_limit - LIMIT_STEP_MAX
						: limit;
				limit = Math.round(limit / LIMIT_ROUND || 1, 0) * ( LIMIT_ROUND || 1);	
				if(limit ===  Math.round(dtu_limit /LIMIT_ROUND || 1, 0) * ( LIMIT_ROUND || 1)) {
					print("INFO: No limit adjustment required.");
					return;
				}
				  
        			Shelly.call(
					'HTTP.POST', {
						url: "http://admin:" + DTU_PWD + "@" + DTU_IP + "/api/limit/config",
						body: "data={\"serial\":\"" +  dtu.inverters[0].serial + "\",\"limit_type\":0,\"limit_value\":" + limit + "}",
						content_type: "application/x-www-form-urlencoded",
						ssl_ca: "*",
						timeout: 15
					},
					function(result) {
						
						if (typeof result !== "object" || typeof result.code !== "number" || result.code !== 200 ) {
							print("ERROR: Limit not set");
							return;				
						}
						
						print("INFO: New limit set to " + limit);	
						return;				
					}
				);    
			}
		);
	}
);	
