const availableInputs = require('./inputs')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

async function pingHost(ip) {
	try {
		await execAsync(`ping -c 1 -W 1 ${ip}`)
		return true
	} catch {
		return false
	}
}

async function safeAVRCall(log, debug, promise, description) {
	try {
		return await promise
	} catch (err) {
		if (debug) {
			log(`AVR command failed (${description}): ${err.message}`)
		}
	}
}

module.exports = {

	// Bound to `this` in Receiver.js constructor
	getState: async function() {
		// If currently powering on and powerOnDelay not finished, we might skip some checks
		const reachable = await pingHost(this.config.ip)

		if (!reachable) {
			this.log.easyDebug(`Unreachable. Assuming OFF.`)

			if (this.id in this.cachedStates) {
				const cached = this.cachedStates[this.id]
				return { power: 0, volume: 0, mute: true, source: cached.source || 0 }
			} else {
				return { power: 0, volume: 0, mute: false, source: 0 }
			}
		}

		// If reachable, attempt to get state from AVR
		const powerOn = await safeAVRCall(this.log, this.config.debug, this.avr.isOn('main'), 'isOn')
		const rawVolume = await safeAVRCall(this.log, this.config.debug, this.avr.getVolume('main'), 'getVolume')
		const mute = await safeAVRCall(this.log, this.config.debug, this.avr.getMute('main'), 'getMute')
		const sourceName = await safeAVRCall(this.log, this.config.debug, this.avr.getSource('main'), 'getSource')

		if (powerOn === undefined || rawVolume === undefined || mute === undefined || sourceName === undefined) {
			this.log.easyDebug(`Reachabe but incomplete data from AVR, probably still booting. Using cached/OFF state`)

			if (this.id in this.cachedStates) {
				const cached = this.cachedStates[this.id]
				return { power: 0, volume: 0, mute: true, source: cached.source || 0 }
			} else {
				return { power: 0, volume: 0, mute: false, source: 0 }
			}
		}

		const state = {
			power: powerOn ? 1 : 0,
			volume: Math.round(rawVolume / this.maxVolume * 100),
			mute: mute,
			source: availableInputs.main.indexOf(sourceName)
		}

		if (this.config.debug) {
			const pwrStr = state.power ? 'ON' : 'OFF'
			const muteStr = state.mute ? 'MUTE=ON' : 'MUTE=OFF'
			const srcName = availableInputs.main[state.source] || availableInputs.main[0]
			this.log.easyDebug(`Received New State: Power=${pwrStr}, Volume=${state.volume}%, ${muteStr}, Source=${srcName}`)
		}

		this.cachedStates[this.id] = state
		await this.storage.setItem('cachedStates', this.cachedStates)
		return state
	},

	set: {
		Active: async function(state, callback) {
			// Immediately respond to HomeKit
			callback();

			if (state) {
				this.log.easyDebug(`ON requested`)

				if (this.config.powerCommand) {
					exec(this.config.powerCommand, (error) => {
						if (error) {
							this.log(`powerCommand error: ${error.message}`)
						} else {
							this.log.easyDebug(`powerCommand executed for ON`)
						}
					})
				} else {
					this.log(`No powerCommand set. Can't turn on.`)
				}

				// Mark that we're waiting for powerOnDelay
				this.isPoweringOn = true
				setTimeout(async () => {
					this.isPoweringOn = false
					const reachable = await pingHost(this.config.ip)
					if (reachable) {
						this.log.easyDebug(`Reachable after powerOnDelay, getting state...`)
						this.state = await this.getState()
					} else {
						this.log.easyDebug(`Not reachable after delay, fallback state`)
						this.state = await this.getState()
					}
					this.updateState()
				}, this.config.powerOnDelay * 1000)

			} else {
				this.log.easyDebug(`OFF requested`)

				// Same command toggles power off
				if (this.config.powerCommand) {
					exec(this.config.powerCommand, (error) => {
						if (error) {
							this.log(`powerCommand error (OFF): ${error.message}`)
						} else {
							this.log.easyDebug(`powerCommand executed for OFF`)
						}
					})
				} else {
					this.log(`No powerCommand set. Can't turn off.`)
				}

				// Short delay and update
				setTimeout(async () => {
					const reachable = await pingHost(this.config.ip)
					if (!reachable) {
						this.log.easyDebug(`Confirmed OFF (unreachable)`)
					} else {
						this.log.easyDebug(`Still reachable after OFF. Assuming still ON.`)
					}
					this.updateState()
				}, 2000)
			}
		},

		ActiveIdentifier: async function(identifier, callback) {
			callback();
			const source = availableInputs.main[identifier]
			this.log.easyDebug(`Set Source to ${source}`)
			await safeAVRCall(this.log, this.config.debug, this.avr.setSource(source, 'main'), 'setSource')
			setTimeout(() => {
				this.updateState()
			}, 2000)
		},

		RemoteKey: async function(key, callback) {
			callback();
			const RemoteKey = this.api.hap.Characteristic.RemoteKey
			let cmd
			switch (key) {
				case RemoteKey.ARROW_UP: cmd = "UP"; break
				case RemoteKey.ARROW_DOWN: cmd = "DOWN"; break
				case RemoteKey.ARROW_RIGHT: cmd = "RIGHT"; break
				case RemoteKey.ARROW_LEFT: cmd = "LEFT"; break
				case RemoteKey.SELECT: cmd = "ENTER"; break
				case RemoteKey.BACK: cmd = "EXIT"; break
				case RemoteKey.INFORMATION: cmd = "MENU"; break
				default: cmd = null
			}
			if (cmd) {
				this.log.easyDebug(`Remote Key: ${cmd}`)
				await safeAVRCall(this.log, this.config.debug, this.avr.sendRemoteKey(cmd), `sendRemoteKey(${cmd})`)
			}
			setTimeout(() => {
				this.updateState()
			}, 2000)
		},

		Volume: async function(volume, callback) {
			callback();
			const mappedVolume = Math.round(this.maxVolume / 100 * volume)
			this.log.easyDebug(`Volume to ${mappedVolume}`)
			await safeAVRCall(this.log, this.config.debug, this.avr.setVolume(mappedVolume, 'main'), `setVolume(${mappedVolume})`)
			setTimeout(() => {
				this.updateState()
			}, 2000)
		},

		Mute: async function(mute, callback) {
			callback();
			this.log.easyDebug(`Mute ${mute ? 'ON' : 'OFF'}`)
			if (mute) {
				await safeAVRCall(this.log, this.config.debug, this.avr.mute('main'), 'mute')
			} else {
				await safeAVRCall(this.log, this.config.debug, this.avr.unMute('main'), 'unMute')
			}
			setTimeout(() => {
				this.updateState()
			}, 2000)
		},

		VolumeSelector: async function(decrement, callback) {
			callback();
			this.log.easyDebug(`Volume ${decrement ? 'Down' : 'Up'}`)
			if (decrement) {
				await safeAVRCall(this.log, this.config.debug, this.avr.volDown('main'), 'volDown')
			} else {
				await safeAVRCall(this.log, this.config.debug, this.avr.volUp('main'), 'volUp')
			}
			setTimeout(() => {
				this.updateState()
			}, 2000)
		},

		ExternalVolume: async function(volume, callback) {
			callback();
			const mappedVolume = Math.round(this.maxVolume / 100 * volume)
			this.log.easyDebug(`Ext. Volume ${mappedVolume}`)
			await safeAVRCall(this.log, this.config.debug, this.avr.setVolume(mappedVolume, 'main'), `setVolume(${mappedVolume})`)
			setTimeout(() => {
				this.updateState()
			}, 2000)
		},

		ExternalMute: async function(unmute, callback) {
			callback();
			this.log.easyDebug(`Ext. Mute ${unmute ? 'OFF' : 'ON'}`)
			if (!unmute) {
				await safeAVRCall(this.log, this.config.debug, this.avr.mute('main'), 'mute')
			} else {
				await safeAVRCall(this.log, this.config.debug, this.avr.unMute('main'), 'unMute')
			}
			setTimeout(() => {
				this.updateState()
			}, 2000)
		}
	}
}
