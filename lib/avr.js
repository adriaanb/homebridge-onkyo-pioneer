const { Onkyo } = require('onkyo.js')
const Receiver = require('../accessories/Receiver')

module.exports = {
	init: async function() {
		const config = this.config

		await this.storage.init({
			dir: this.persistPath,
			forgiveParseErrors: true
		})

		this.cachedStates = await this.storage.getItem('cachedStates') || []

		config.port = config.port || 60128
		config.maxVolume = config.maxVolume || 75
		config.powerOnDelay = config.powerOnDelay || 45
		config.volumeAccessory = config.volumeAccessory || 'bulb'

		let avr
		try {
			avr = await new Onkyo({
				logger: {
					...this.log,
					silly: this.log.easyDebug,
					info: this.log.easyDebug,
					debug: this.log.debug,
					warn: this.log.easyDebug,
					error: this.log.easyDebug,

				},
				address: config.ip,
				port: config.port,
				name: config.name
			})
		} catch (err) {
			this.log.easyDebug('ERROR starting device:', err.message)
		}

		config.id = 'OnkyoTX8050'
		config.model = 'Onkyo TX-8050'

		const deviceConfig = {
			id: config.id,
			name: config.name || config.model,
			ip: config.ip,
			info: { modelName: config.model },
			volumeAccessory: config.volumeAccessory,
			maxVolume: config.maxVolume,
			powerCommand: config.powerCommand,
			powerOnDelay: config.powerOnDelay,
			statePollingInterval: this.statePollingInterval,
			debug: this.debug
		}

		new Receiver(avr, this, deviceConfig)
	}
}
