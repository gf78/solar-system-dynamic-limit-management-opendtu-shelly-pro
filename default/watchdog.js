/* Watchdog: Restart scripts automatically */

let CONFIG = {
  autoStart: true,               // set this script to autostart
  restartOnlyEnabled: true,      // only (re-)start scripts with autostart enabled?
  restartDelayMS: 5000,          // time (ms) to wait before restarting a script
  restartFollowUpMS: 30000,      // time (ms) to wait after restarting a script
  checkIntervalMS: 60000         // interval (ms) to check all scripts (additionally to status event handler)
};





let checkIntervalHandle = null;
let delayTimerHandle = null;
let followUpTimerHandle = null;
let statusHandlerHandle = null;
let pendingRestart = false;


function setPending(value) {
  pendingRestart = value === true;
  try {
    if(followUpTimerHandle ) {
      Timer.clear(followUpTimerHandle );
    }
  } catch(e){}  
}


function startFollowUpTimer() {
  try { 
    if(typeof CONFIG.restartFollowUpMS === "number" && CONFIG.restartFollowUpMS > 0) {
       print("[WATCHDOG] Pausing for" + JSON.stringify(CONFIG.restartFollowUpMS) + "ms.");
      followUpTimerHandle = Timer.set(CONFIG.restartFollowUpMS, false, setPending, false);
    } else {
     setPending(false);
   }  
  } catch(e) {
    setPending(false);
  }
}


// Notify about restart success
function notifySuccess(result, error_code, error_message, userdata) {  
  if(error_code === 0) {    
    print("[WATCHDOG] OK. Script #" + JSON.stringify(userdata) + " has been restarted successfully.");
    startFollowUpTimer();     
  } else {
     print("[WATCHDOG] ERROR. Script #" + JSON.stringify(userdata) + " has not been restarted. " + error_message);
     setPending(false);
  }
}

// Restart script
function startScript(data) {
   if(typeof data !== "object" || typeof data.id !== "number" || typeof data.callback !== "function" ) {
     print("[WATCHDOG] ERROR. Invalid start script params.");
     setPending(false);
     return;
   }
   try {
     print("[WATCHDOG] Try to restart script #" + JSON.stringify(data.id));
     Shelly.call("Script.Start", {id:data.id}, data.callback, data.id);   
   } catch(e) {
      setPending(false);   
      print("[WATCHDOG] ERROR. Could not trigger start of script #" + JSON.stringify(data.id) +": " + JSON.stringify(e.message));      
   }
}



// delayed execution of callback
function execWithDelay(callback, userdata) {
  
  if(typeof callback !== "function") {
    print("[WATCHDOG] ERROR. Callback is not a function");
    setPending(false);
    return;
  }
  
  try {
    if(delayTimerHandle) {
      Timer.clear(delayTimerHandle);
    }
  } catch(e){
    print("[WATCHDOG] WARNING. Could not clear timer: " + JSON.stringify(e.message));
  }
  
  try {
    let delay = typeof CONFIG.restartDelayMS  === "number" ? Math.max(1,CONFIG.restartDelayMS) : 1;
    print("[WATCHDOG] Wait for " + JSON.stringify(delay ) + "ms.");
    delayTimerHandle = Timer.set(delay, false, callback, userdata);
    return true;    
  } catch(e) {
    print("[WATCHDOG] ERROR. Could set timer: " + JSON.stringify(e.message));
  }
  
  try {
    callback(userdata);
    return true;
  } catch(e) {
    setPending(false);
    print("[WATCHDOG] ERROR. Could execute callback : " + JSON.stringify(e.message));
  }
  
  return false; 
}



// Parse Script config and restart if config is set to "enabled"
function evaluateRestart(result, error_code, error_message, userdata) {

  if(error_code !== 0) {
    print("[WATCHDOG] ERROR. Could not retrieve configuration of script #" + JSON.stringify(userdata) + ": " + error_message);
    setPending(false);
    return;
  }
  
  try {   
   if(typeof result === "object" && typeof result.id === "number" && (result.enable === true  || CONFIG.restartOnlyEnabled === false))
     {
       setPending(true);
       print("[WATCHDOG] Script #" + JSON.stringify(result.id) + " will be restarted.");
       execWithDelay(startScript, {id: result.id, callback: notifySuccess});
     } 
   } catch (e) {
    setPending(false);     
    print("[WATCHDOG] ERROR. Could not evaluate restart: " + JSON.stringify(e.message));
  }  
}


// (Script) event handler
function statusHandler(event_data, userdata) {
  try {
    if(pendingRestart === false && typeof event_data === "object" && event_data.name === "script" && typeof event_data.delta === "object" && event_data.delta.running === false && typeof event_data.delta.id === "number" ) {
      print("[WATCHDOG] Script #" + JSON.stringify(event_data.delta.id) + " stopped.");
      Shelly.call("Script.GetConfig", {id: event_data.delta.id}, evaluateRestart, event_data.delta.id);
    }   
  } catch (e) {
    setPending(false);
    print("[WATCHDOG] ERROR. Could not handle status change: " + JSON.stringify(e.message));
  }  
}


function processScriptList(result, error_code, error_message, userdata) {
 
  try {

    if(error_code !== 0) {
      print("[WATCHDOG] ERROR. Could not retrieve list of scripts: " + error_message);
      return;
    }

    if(typeof result !== "object" || !Array.isArray(result.scripts) || result.scripts.length < 1) {
      print("[WATCHDOG] ERROR. Retrieved invalid scripts list data.");
      return;
    }


    for(let i = 0; i < result.scripts.length; i++) {
      let script = result.scripts[i];      
      if(typeof script === "object" && typeof script.id === "number" && script.running === false && (script.enable === true  || CONFIG.restartOnlyEnabled === false)) {
         print("[WATCHDOG] Script #" + JSON.stringify(script.id) + " will be restarted.");
         setPending(true);
         execWithDelay(startScript, {id: script.id, callback: notifySuccess});
         break; // handle only one script
      }
    }
  } catch(e) {
      setPending(false);
      print("[WATCHDOG] ERROR. Could not process script list: " + JSON.stringify(e.message));
  }

}


function getScriptList(callback, userdata) {
  
  if(pendingRestart === true) {
    return;
  }
  
  if(typeof callback !== "function") {
    print("[WATCHDOG] ERROR. Invalid callback (getScriptList).");
    return;
  }
  try {
    // print("[WATCHDOG] Retrieve list of scripts");
    Shelly.call("Script.List", null, callback, userdata);    
  } catch (e) {
    print("[WATCHDOG] ERROR. Could retrieve script list: " + JSON.stringify(e.message));
  }      
}


function setAutoStart() {
  try { 
     let autoStart = CONFIG.autoStart === true; 
     print("[WATCHDOG] Set autostart: " + JSON.stringify(autoStart ));
    Shelly.call('Script.SetConfig', {id: Shelly.getCurrentScriptId(), config:{enable: autoStart  }});    
  } catch (e) {
    print("[WATCHDOG] ERROR. Could not set autostart: " + JSON.stringify(e.message));
  }  
}





// Main
try {

  setAutoStart(); 

  statusHandlerHandle = Shelly.addStatusHandler(statusHandler);  

  if(typeof CONFIG.checkIntervalMS === "number" && CONFIG.checkIntervalMS > 0) {
    checkIntervalHandle = Timer.set(CONFIG.checkIntervalMS, true, getScriptList, processScriptList);
  }
  print("[WATCHDOG] Started");
  
} catch (e) {
  print("[WATCHDOG] ERROR. Could not add Status Handler: " + JSON.stringify(e.message));
}
