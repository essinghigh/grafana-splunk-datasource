# Grafana - Splunk Datasource

![Grafana Splunk Datasource](https://github.com/essinghigh/grafana-splunk-datasource/actions/workflows/ci.yml/badge.svg?branch=main)

> **NOTE >>>**
>
>This is a hard fork of [efcasado/grafana-plugin-splunk-datasource](https://github.com/efcasado/grafana-plugin-splunk-datasource) as the project has been abandoned for three years. I have updated a significant amount of the repo to the point that it does not have much in common with the original.

> **IMPORTANT NOTICE & DISCLAIMER >>>**
>
> This Splunk datasource plugin for Grafana is an independent project and is not affiliated with, endorsed, or sponsored by Grafana Labs. 
> 
> It was created without any reference to or knowledge of the official, closed-source Splunk plugin available in Grafana's Enterprise plan. This plugin is provided "as-is" under the MIT License, with no warranties of any kind, express or implied.
> 
> As an unsigned plugin, you will need to configure your Grafana instance to allow its use. Please be aware that this plugin under active development, and breaking changes may be introduced. Use in a production environment is not recommended without thorough testing. 

## What is the Grafana - Splunk Datasource

The "Grafana - Splunk Datasource" plugin is a Grafana plugin that
allows you to run SPL queries on Splunk via Grafana.

![image](https://github.com/user-attachments/assets/e7c7ff5e-be86-4bf3-9782-933bb3a846ef)

### Primary Features
* Support for query variables
* Support for Base/Chain searches

## Installation

1. Download the latest release of the plugin

2. Unzip it in your Grafana's installation plugin directory (eg. `/var/lib/grafana/plugins`)

    ```bash
    tar -zxf essinghigh-splunk-datasource-XXXXX.tar.gz -C YOUR_PLUGIN_DIR
    ```
3. As of Grafana v8+ you must explicitly define any unsigned plugins that you wish to allow / load (eg edit:  `/etc/grafana/grafana.ini`

    ```allow_loading_unsigned_plugins = essinghigh-splunk-datasource ```
 
## Configuration

The plugin can be configured
by an administrator from Grafana's UI `Configuration --> Datasources --> Add data source`. 

NB: By default Splunk's REST API is only available via HTTPS (even if you allow HTTP access on a differen port), ie it is usually at: https://<ServerIP>:8089

(example configuration via the Grafana web-GUI (in Grafana 11.6.1):

<img src="https://github.com/user-attachments/assets/a5790b24-e1d8-4ed7-8f52-fa6e2df0d511" width="50%" />

## Testing in Grafana:

### Using a standard Splunk Query as a Grafana Query (and showing splunk results):`
![image](https://github.com/user-attachments/assets/008c243f-1881-4747-a345-f81323f8be22)

### Using base / chain searches
![image](https://github.com/user-attachments/assets/87924b9d-a6f8-4a00-9b6c-3a2444f88615)
![image](https://github.com/user-attachments/assets/c3e72369-606a-41b3-a06c-691ff3934c2d)
![image](https://github.com/user-attachments/assets/44b807e7-09c0-4caa-9aa4-4d9dfc2a722d)

