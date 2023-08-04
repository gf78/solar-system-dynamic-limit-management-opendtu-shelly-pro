# dynamic-limit-managment-opendtu-shelly

Dynamic limit managment for OpenDTU with Shelly Gen2 device ( EM3 Pro, Plus 1PM, Plus 2PM, Plus 1PM Pro, Plus 2PM Pro)

Run this script directly on your shelly generation 2 device to dynamically set the limit of your OpenDTU.


Version: 0.1


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
* Shelly 2. Gen (Pro prefered, https://shelly-api-docs.shelly.cloud/gen2/)


## Features
* Dynamic limit management
* No additional HW/SW required
* Mini web service to start/stop the limit mgmt
* Rest API to start/stop the limit mgmt and get the current state


## Website
* URL: http://< ip-of-shelly >/script/< script-id>/

## REST API
* Status: GET http://< ip-of-shelly >/script/< script-id >/api/status
* Start: GET http://< ip-of-shelly >/script/< script-id >/api/start
* Stop: GET http://< ip-of-shelly >/script/< script-id >/api/stop

## How to run a script on shelly device
* https://shelly-api-docs.shelly.cloud/gen2/Scripts/Tutorial


