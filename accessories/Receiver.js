const stateManager = require('../lib/stateManager')

let Characteristic, Service

class AUDIO_RECEIVER {
	constructor(avr, platform, config) {
		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic

		this.storage = platform.storage
		this.avr = avr
		this.log = platform.log
		this.api = platform.api
		this.config = config

		this.avrId = 'mainZone'
		this.id = 'mainZone'
		this.name = this.config.name || 'Onkyo TX-8050'
		this.model = this.config.info.modelName
		this.manufacturer = 'Onkyo'
		this.displayName = this.name
		this.inputs = require('../lib/inputs').main.map((input, i) => ({identifier: i, name: input, key: input, hidden: 0}))
		this.maxVolume = this.config.maxVolume || 75
		this.volumeAccessory = this.config.volumeAccessory || 'bulb'

		this.cachedStates = platform.cachedStates
		this.processing = false
		this.UUID = this.api.hap.uuid.generate(this.id)

		// Bind getState function so we can call this.getState() easily
		this.getState = stateManager.getState.bind(this)

		this.log.easyDebug(`Creating AUDIO RECEIVER: "${this.name}"`)

		this.accessory = new this.api.platformAccessory(this.name, this.UUID, this.api.hap.Accessory.Categories.AUDIO_RECEIVER)

		let informationService = this.accessory.getService(Service.AccessoryInformation)
		if (!informationService)
			informationService = this.accessory.addService(Service.AccessoryInformation)

		informationService
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.SerialNumber, 'SingleZone-1')

		this.setServices()
			.then(() => {
				this.api.publishExternalAccessories('homebridge-onkyo-tx8050', [this.accessory])
				// Polling interval
				setInterval(() => {
					// Skip polling if still powering on
					if (this.isPoweringOn) {
						this.log.easyDebug(`Skipping poll, still in powerOnDelay period`)
						return
					}
					this.updateState()
				}, this.config.statePollingInterval * 1000)
			})
			.catch(err => {
				this.log('ERROR setting services')
				this.log(err)
			})
	}

	async setServices() {
		this.state = await this.getState()

		this.tvService = this.accessory.addService(Service.Television, this.name)

		this.tvService.getCharacteristic(Characteristic.ConfiguredName)
			.on('set', (name, callback) => {
				this.log.easyDebug(`ConfiguredName from ${this.name} to ${name}`)
				this.name = name
				callback()
			}).updateValue(this.name)

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('set', stateManager.set.Active.bind(this))
			.updateValue(this.state.power)

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', stateManager.set.ActiveIdentifier.bind(this))
			.updateValue(this.state.source)

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', stateManager.set.RemoteKey.bind(this))

		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)

		this.inputs.forEach(input => {
			const inputUUID = this.api.hap.uuid.generate(this.id + input.key)
			const inputService = this.accessory.addService(Service.InputSource, input.name, inputUUID)
				.setCharacteristic(Characteristic.Identifier, input.identifier)
				.setCharacteristic(Characteristic.IsConfigured, 1)
				.setCharacteristic(Characteristic.InputSourceType, 0)
				.setCharacteristic(Characteristic.InputDeviceType, 0)
				.setCharacteristic(Characteristic.CurrentVisibilityState, input.hidden)

			inputService.getCharacteristic(Characteristic.TargetVisibilityState)
				.on('set', (hidden, callback) => {
					this.log.easyDebug(`Input ${input.name} now ${hidden ? 'HIDDEN' : 'VISIBLE'}`)
					inputService.getCharacteristic(Characteristic.CurrentVisibilityState).updateValue(hidden)
					input.hidden = hidden
					callback()
				})
				.updateValue(input.hidden)

			inputService.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (newName, callback) => {
					this.log.easyDebug(`Input rename: ${input.name} -> ${newName}`)
					input.name = newName
					callback()
				})
				.updateValue(input.name)

			this.tvService.addLinkedService(inputService)
		})

		this.speakerService = this.accessory.addService(Service.TelevisionSpeaker)
			.setCharacteristic(Characteristic.Active, 1)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.RELATIVE_WITH_CURRENT)

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('set', stateManager.set.Volume.bind(this))
			.updateValue(this.state.volume)

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('set', stateManager.set.Mute.bind(this))
			.updateValue(this.state.mute)

		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', stateManager.set.VolumeSelector.bind(this))

		switch(this.volumeAccessory) {
			case 'fan':
				this.addFanService()
				break
			default:
				this.addBulbService()
		}
	}

	addBulbService() {
		this.log.easyDebug(`Adding Volume Bulb for ${this.name}`)
		this.bulbService = this.accessory.addService(Service.Lightbulb, `${this.name} Volume`)

		this.bulbService.getCharacteristic(Characteristic.On)
			.on('set', stateManager.set.ExternalMute.bind(this))
			.updateValue(!this.state.mute)

		this.bulbService.getCharacteristic(Characteristic.Brightness)
			.on('set', stateManager.set.ExternalVolume.bind(this))
			.updateValue(this.state.volume)
	}

	addFanService() {
		this.log.easyDebug(`Adding Volume Fan for ${this.name}`)
		this.fanService = this.accessory.addService(Service.Fan, `${this.name} Volume`)

		this.fanService.getCharacteristic(Characteristic.On)
			.on('set', stateManager.set.ExternalMute.bind(this))
			.updateValue(!this.state.mute)

		this.fanService.getCharacteristic(Characteristic.RotationSpeed)
			.on('set', stateManager.set.ExternalVolume.bind(this))
			.updateValue(this.state.volume)
	}

	async updateState() {
		if (!this.processing) {
			this.processing = true
			this.state = await this.getState()

			this.tvService.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(this.state.power)
			this.tvService.getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier).updateValue(this.state.source)
			this.speakerService.getCharacteristic(this.api.hap.Characteristic.Volume).updateValue(this.state.volume)
			this.speakerService.getCharacteristic(this.api.hap.Characteristic.Mute).updateValue(this.state.mute)

			if (this.volumeAccessory === 'bulb') {
				this.bulbService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(!this.state.mute)
				this.bulbService.getCharacteristic(this.api.hap.Characteristic.Brightness).updateValue(this.state.volume)
			} else {
				this.fanService.getCharacteristic(this.api.hap.Characteristic.On).updateValue(!this.state.mute)
				this.fanService.getCharacteristic(this.api.hap.Characteristic.RotationSpeed).updateValue(this.state.volume)
			}

			setTimeout(() => {
				this.processing = false
			}, 1000)
		}
	}
}

module.exports = AUDIO_RECEIVER
