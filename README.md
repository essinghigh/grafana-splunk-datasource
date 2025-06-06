# Splunk Datasource for Grafana

> **DISCLAIMER!**
> This plugin is a proof-of-concept and breaking changes are very likely to be introduced.
> Also, it has only been used in toy environments. Thus, if you are considering using it
> in a production environment, do it at your own risk!


## What is the Splunk Datasource for Grafana

Splunk Datasource for Grafana is a Grafana plugin that
allows you to pull Splunk data into your Grafana dashboards. Or, in other words,
it is a Grafana plugin that allows you to query Splunk directly from Grafana.

![image](https://github.com/user-attachments/assets/3ed0255b-c794-4e7f-bebb-5c35c35e75a0)

### Installation

1. Download the latest release of the plugin

2. Unzip it in your Grafana's installation plugin directory (eg. `/var/lib/grafana/plugins`)

    ```bash
    tar -zxf essinghigh-splunk-datasource-XXXXX.tar.gz -C YOUR_PLUGIN_DIR
    ```
3. As of Grafana v8+ you must explicitly define any unsigned plugins that you wish to allow / load (eg edit:  `/etc/grafana/grafana.ini`

    ```allow_loading_unsigned_plugins = essinghigh-splunk-datasource ```
 
### Configuration

The plugin can be configured
by an administrator from Grafana's UI `Configuration --> Datasources --> Add data source`. 

NB: By default Splunk's REST API is only available via HTTPS (even if you allow HTTP access on a differen port), ie it is usually at: https://<ServerIP>:8089

(example configuration via the Grafana web-GUI (in Grafana 11.6.1):

<img src="https://github.com/user-attachments/assets/ec73429f-2c63-4f0e-9fa1-ed33581e5e8a" width="50%" />



    
### Testing in Grafana:
    Using a standard Splunk Query as a Grafana Query (and showing splunk results):
![image](https://github.com/user-attachments/assets/008c243f-1881-4747-a345-f81323f8be22)

