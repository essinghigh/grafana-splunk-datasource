import React, { PureComponent } from 'react';
import {
  ConfigSection,
  ConnectionSettings,
  Auth,
  AdvancedHttpSettings,
  convertLegacyAuthProps,
} from '@grafana/plugin-ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { SplunkDataSourceOptions } from './types';

interface Props extends DataSourcePluginOptionsEditorProps<SplunkDataSourceOptions> {}

interface State {}

export class ConfigEditor extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
  }

  render() {
    const { options, onOptionsChange } = this.props;

    return (
      <>
        {ConnectionSettings({ config: options, onChange: onOptionsChange }) as React.ReactElement}
        <Auth {...convertLegacyAuthProps({ config: options, onChange: onOptionsChange })} />
        <ConfigSection title="Advanced settings" isCollapsible isInitiallyOpen={false}>
          {AdvancedHttpSettings({ config: options, onChange: onOptionsChange }) as React.ReactElement}
        </ConfigSection>
      </>
    );
  }
}
