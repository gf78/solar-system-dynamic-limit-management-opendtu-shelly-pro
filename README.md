# dynamic-limit-managment-opendtu-shelly

Dynamic limit managment for OpenDTU with Shelly Gen2 device ( EM3 Pro, 1PM Pro, 2PM Pro)

Run this script directly on your shelly generation 2 device to dynamically set the limit of your OpenDTU.

## IMPORTANT NOTE
Please use the dlm_light.js script for now. The full version (script.js) consumes too much memory on the shelly.


## Keywords (German)

* Balkonkraftwerk
* Nulleinspeisung
* OpenDTU
* Shelly
* Hoymiles
* Solar
* Speicher



## Requirements
* OpenDTU (https://github.com/tbnobody/OpenDTU) 
* Shelly 2. Gen Pro device

## How to run a script on shelly device
* https://shelly-api-docs.shelly.cloud/gen2/Scripts/Tutorial


## Features
* Dynamic limit management
* No additional HW/SW required
* Mini web service to start/stop the limit mgmt (unstable)
* Rest API to start/stop the limit mgmt and get the current state (unstable)


## Website (unstable)
* URL: http://< ip-of-shelly >/script/< script-id>/

## REST API (unstable)
* Status: GET http://< ip-of-shelly >/script/< script-id >/api/status
* Start: GET http://< ip-of-shelly >/script/< script-id >/api/start
* Stop: GET http://< ip-of-shelly >/script/< script-id >/api/stop




