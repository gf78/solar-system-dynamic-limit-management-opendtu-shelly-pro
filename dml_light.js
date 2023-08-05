/*
  DYNAMIC LIMIT MANAGEMENT  - LIGHT VERSION
  Run on Shelly 2nd generation device to control to dynamically manage OpenDTU limit.
  Version 1, 05.08.2023, GF78
*/


/***** CONFIGURATION ***/
let CONFIG = {
    dtu: {
        ip: "10.0.0.xxx",			// Local IP address of OpenDTU
        user: "admin",				// User for OpenDTU, default: "admin"
        password: "secret",			// Password for OpenDTU (hint: write "%40" instead of "@")
        inverter: 0, 				// Index of inverter, default: 0 (first)
	timeout: 15,				// Timeout for API request [Seconds]
    },
    shelly: {
        type: null, 				// Component type: "EM" or "Switch", default: null (auto detect)
        id: 0, 						// Component id, default: 0 (first component)
		phase: null, 				// Optional phase filter for EM: "a", "b", "c", default null (no filter)
    },
    grid: {
        min: -700 					// Target grid power [Watt]. e.g. 0 for zero feed, -700 for excess feed
    },
    limit: {
		min: 800,					// Minimum limit [Watt]
		max: 1500,					// Maximum limit [Watt]
		step: {
			size: 50,				// Adjustment step increment [Watt]
			min: 50,				// Ignore small limit adjustments [Watt]
			max: 100,				// Maximum limit adjustment per run [Watt]			
		},
		interval: 30				// Interval of limit adjustment [Seconds]
    }
}


/***** DO NOT CHANGE FROM HERE ON *****/

// Get current power, measured by Shelly EM device
function getShellyPowerEM() {
	
	// Determine measurment name for Shelly EM based on opt. phase filter
	let phase = "total";
	if(typeof CONFIG.shelly.phase === "string") {
			switch(CONFIG.shelly.phase.toLowerCase()) {
				case: "a":
					phase = "a";
					break;
				case: "b":
					phase = "b";
					break;
				case: "c":
					phase = "c";
					break;
				default:
					phase = "total";
			}		
	}
	phase += "_act_power";
	
	// Read and validate shelly measurement
	let status = Shelly.getComponentStatus("EM", CONFIG.shelly.id || 0);	
    if (status && typeof status === "object" && typeof status[phase] === "number") {
        return {
            power: Math.round(status[phase] || 0), 
            error: false
        };
    } else {
        return {
            power: undefined,
            error: true
        };
    }	
}


// Get current power, measured by Shelly swtich device
function getShellyPowerSwitch() {
    let data = Shelly.getComponentStatus("Switch", CONFIG.shelly.id || 0);
    if (data && typeof data === "object" && typeof data.aenergy === "object" && typeof data.aenergy.total === "number") {
        return {
            power: Math.round(data.aenergy.total || 0),
            error: false
        };
    } else {
        return {
            power: undefinded,
            error: true
        };
    }
}




// STEP 1: Check if limit management is enabled
function step1Start() {
		 let data = {
			ts: new Date() 
		 };
   step2GetDtuData(data);
}


// STEP 2: Get current DTU data and trigger manage limit
function step2GetDtuData(data) {
	
	if(	typeof CONFIG.dtu.ip !== "string" ||
		typeof CONFIG.dtu.user !== "string" ||
		typeof CONFIG.dtu.password !== "string") {
		
		print("ERROR: Invalid DTU configuration.");
        return;				
	}
		
    Shelly.call(
        'HTTP.GET', {
            url: "http://" + CONFIG.dtu.user + ":" + CONFIG.dtu.password + "@" + CONFIG.dtu.ip + "/api/livedata/status",
            timeout: CONFIG.dtu.timeout || 15,
            ssl_ca: "*"
        },
        function(result, error_code, error_message, user_data) {
            if (typeof result === "object" &&
                typeof result.code === "number" &&
                (result.code === 200 || result.code === 204) &&
                typeof result.body === "string"
            ) {
                let dtu = JSON.parse(result.body);

                if (!(dtu.inverters[CONFIG.dtu.inverter || 0].reachable || false)) {
                    print("INFO: DTU is not reachable.");
                    return;
                }

                data.dtu = {
					serial: dtu.inverters[CONFIG.dtu.inverter || 0].serial || null,
					power: Math.round(dtu.inverters[CONFIG.dtu.inverter || 0].AC[0].Power.v || 0, 0),
					limit: Math.round(dtu.inverters[CONFIG.dtu.inverter || 0].limit_absolute || 0)
                };

                step3GetShellyPower(data);

            } else {
                print("ERROR: Could not retrieve DTU data.")
            }
        }
    );
}


// STEP 3: Get act power from this shelly
function step3GetShellyPower(data) {

	let type = CONFIG.shelly.type === "string" ? CONFIG.shelly.type.toLowerCase() : null;

    if (type === "em") {
        data.meter = getShellyPowerEM();
    }
    if (type === "switch") {
        data.meter = getShellyPowerSwitch();
    } else {
        data.meter = getShellyPowerEM();
        if (data.meter.error) {
            data.meter = getShellyPowerSwitch();
        }
    }

    if (data.meter.error) {
        print("ERROR: Failed to retrieve actual grid power.");
        return;
    }
	
    step4CalculateLimit(data);
}



// STEP 4: Calculate Limit
function step4CalculateLimit(data) {
	
	// Potential new limit
	data.limit = data.dtu.limit + data.meter.power - CONFIG.grid.min; 
	
	// Round new limit based on config step
	data.limit = Math.round(data.limit / CONFIG.limit.step.size || 1, 0) * ( CONFIG.limit.step.size || 1);
	
	// Apply min limit
	data.limit = Math.max(data.limit, CONFIG.limit.min, 0);
	
	// Apply max limit
	if( typeof CONFIG.limit.max === "number") {
		data.limit = Math.min(data.limit, CONFIG.limit.max);
	}
	
	// Apply minimum adjustment step
	if( typeof CONFIG.limit.step.min === "number" && 
		Math.abs(data.dtu.limit - data.limit) < CONFIG.limit.step.min
		) {
		data.limit = data.dtu.limit; 
	}

	// Apply maximum adjustment step
	if( typeof CONFIG.limit.step.max === "number" && 
		Math.abs(data.dtu.limit - data.limit) > CONFIG.limit.step.max
		) {
			
		if(data.limit > data.dtu.limit) {
			data.limit = data.dtu.limit + CONFIG.limit.step.max;
		} else {
			data.limit = data.dtu.limit - CONFIG.limit.step.max;
		}
	}
		
	step5AdjustLimit(data);	

}


// Set new DTU limit
function step5AdjustLimit(data) {
	
	if(typeof data.limit !== "number" || data.limit < 0) {
		print("Error: Invalid limit.");
		return;		
	}
	
	if(typeof data.dtu.serial !== "string") {
		print("Error: Invalid inverter serial.");
		return;	
	}
	
    if(data.dtu.limit === data.limit) {
        print("INFO: No limit adjustment required.");
		return;
    } 
	
    Shelly.call(
        'HTTP.POST', {
            url: "http://" + CONFIG.dtu.user + ":" + CONFIG.dtu.password + "@" + CONFIG.dtu.ip + "/api/limit/config",
            body: "data={\"serial\":\"" + data.dtu.serial + "\",\"limit_type\":0,\"limit_value\":" + data.limit + "}",
            content_type: "application/x-www-form-urlencoded",
            ssl_ca: "*",
            timeout: CONFIG.dtu.timeout || 15
        },
        function(result, error_code, error_message, user_data) {

            if (typeof result === "object" &&
                typeof result.code === "number" &&
                (result.code === 204 || result.code === 200)) {
				print("INFO: New limit set to " + data.limit);	
				return;
            } else {
				 print("Error: Could not set new limit.");
				 return;				 
            }
        }
    );
}


// run
Timer.set((CONFIG.limit.interval || 60) * 1000, true, step1Start);	


