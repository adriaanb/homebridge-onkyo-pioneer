const AVR = require('./lib/avr')
const PLUGIN_NAME = 'homebridge-onkyo-tx8050'
const PLATFORM_NAME = 'OnkyoTX8050'
const storage = require('node-persist')
const path = require('path')

module.exports = (api) => {
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, OnkyoTX8050)
}

class OnkyoTX8050 {

	constructor(log, config, api) {
		this.api = api
		this.log = log
		this.storage = storage

		this.config = config || {}
		this.name = this.config.name || PLATFORM_NAME
		this.debug = this.config.debug || false
		this.statePollingInterval = this.config.statePollingInterval || 30
		if (this.statePollingInterval < 3)
			this.statePollingInterval = 3

		this.persistPath = path.join(this.api.user.persistPath(), '/../onkyo-tx8050-persist')

		// Define easyDebug method to output debug logs when enabled
		this.log.easyDebug = (...content) => {
			if (this.debug) {
				this.log(content.reduce((previous, current) => previous + ' ' + current))
			} else {
				this.log.debug(content.reduce((previous, current) => previous + ' ' + current))
			}
		}

		this.api.on('didFinishLaunching', AVR.init.bind(this))
	}

	configureAccessory(accessory) {
		this.log.easyDebug(`Found Cached Accessory: ${accessory.displayName} (${accessory.context.deviceId})`)
	}
}
