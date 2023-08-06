/*
  DYNAMIC LIMIT MANAGEMENT / BASIC
  Shelly Pro 1PM / 2PM & OpenDTU
  06.08.2023, GF78
*/


// CONFIG
let DTU_IP = "xxx.xxx.xxx.xxx";
let DTU_PWD = "secret";
let METER = 0; // 0, 1
let GRID = -700;
let INTERVAL = 60; // sec
let LIMIT_MIN = 800;
let LIMIT_MAX = 1500;
let LIMIT_STEP_MIN = 50;
let LIMIT_STEP_MAX = 100;
let LIMIT_ROUND = 50;


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
				if (!(dtu.inverters[0].reachable || false)) {
					print("INFO: DTU is not reachable.");
					return;
				}
				let dtu_limit = Math.round(dtu.inverters[0].limit_absolute || 0);
				
				// Shelly PM
				let shelly = Shelly.getComponentStatus("Switch", METER);	
				if (!shelly || typeof shelly !== "object" || typeof shelly.aenergy !== "object" || typeof shelly.aenergy.total !== "number") {
					print("ERROR: Unkown shelly power unkown");
					return;
				} 
				let shelly_power = Math.round(shelly.aenergy.total || 0);

				// Limit
				let limit = dtu_limit + shelly_power - GRID;
				limit = (Math.abs(dtu_limit - limit) < LIMIT_STEP_MIN) ? dtu_limit : limit;
				limit = (Math.abs(dtu_limit - limit) > LIMIT_STEP_MAX) 
						? (limit > dtu_limit) ? dtu_limit + LIMIT_STEP_MAX : dtu_limit - LIMIT_STEP_MAX
						: limit;
				limit = Math.min(limit, LIMIT_MAX);
				limit = Math.max(limit, LIMIT_MIN, 0); 
				limit = Math.round(limit / LIMIT_ROUND || 1, 0) * ( LIMIT_ROUND || 1);	
				if(limit ===  (Math.round(dtu_limit / (LIMIT_ROUND || 1)) * ( LIMIT_ROUND || 1))) {
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
