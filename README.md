# homebridge-onkyo-tx8050

## Important Notes

- **This is an experimental plugin. Proceed at your own risk.**
- It relies on custom-built external hardware to implement a power switching mechanism for the TX-8050. Without this hardware, the plugin will not work and should not be used.
- **DO NOT** use this plugin unless you are confident in what you’re doing and plan to implement your own power-switching hardware mechanism. In every other respect, it is a less functional version of the original plugin, which you should use instead: [homebridge-onkyo-pioneer](https://github.com/nitaybz/homebridge-onkyo-pioneer).
- The plugin is completely untested with amplifiers other than the TX-8050 and may not work at all for other models.
- **Compatibility**: The plugin makes use of UNIX system commands (Linux, macOS) and is not compatible with Homebridge setups on Windows.

---

## Description

A [Homebridge](https://github.com/homebridge/homebridge) plugin for controlling the Onkyo TX-8050 audio receiver. This project is a personal learning exercise and primarily serves as documentation for myself. While others are welcome to use it, please proceed with caution and understand that it is untested and experimental.

---

## Acknowledgments

This plugin is a fork of [homebridge-onkyo-pioneer](https://github.com/nitaybz/homebridge-onkyo-pioneer) by [nitaybz](https://github.com/nitaybz). Significant modifications have been made to focus specifically on the Onkyo TX-8050 and its limitations (specifically, the lack of network standby).

---

## Changes Made

- **Removed Support**:
  - Dropped support for multiple amplifiers and zones to simplify adapting the plugin.
- **Custom Power Management**:
  - Introduced a mechanism to power the TX-8050 using custom commands that interact with external hardware (e.g., sending an IR signal via LIRC, a script, or Arduino).
  - This addresses the TX-8050's lack of full network-based power control.
- **Warning**:
  - This plugin has been rewritten significantly. It remains largely untested and may be unstable.
  - If you do not intend to implement the custom power mechanism, **DO NOT use this plugin.**

---

## Requirements

- **Node.js**: >=18.15.0
- **Homebridge**: >=1.6.0
- **Unix-Based System**: This plugin is not compatible with Windows.

---

## Installation

1. **SSH into your Raspberry Pi**:
   ```bash
   ssh pi@<your-pi-ip>
   ```

2. **Launch HomeBridge Shell**:
   ```bash
   sudo hb-shell
   ```

3. **Navigate to the Homebridge plugins directory**:
   ```bash
   cd node_modules
   ```

4. **Clone the repository**:
   ```bash
   git clone https://github.com/adriaanb/homebridge-onkyo-tx8050.git
   ```

5. **Install dependencies**:
   ```bash
   cd homebridge-onkyo-tx8050
   npm install
   ```

5. **Configure Homebridge**:
   Add the plugin to your Homebridge `config.json`, ensuring all required parameters for your setup are included.

6. **Restart Homebridge**:
   ```bash
   sudo systemctl restart homebridge
   ```

---

## Note

This plugin is experimental and not intended for public use. It should not be published to any package registry.
