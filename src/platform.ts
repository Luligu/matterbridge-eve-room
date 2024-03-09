import {
  AirQuality,
  DeviceTypeDefinition,
  DeviceTypes,
  EveHistory,
  RelativeHumidityMeasurement,
  TemperatureDisplayUnits,
  TemperatureMeasurement,
  airQualitySensor,
  TvocMeasurement,
  logEndpoint,
} from 'matterbridge';

import { Matterbridge, MatterbridgeDevice, MatterbridgeAccessoryPlatform, MatterHistory } from 'matterbridge';
import { AnsiLogger } from 'node-ansi-logger';

export class EveRoomPlatform extends MatterbridgeAccessoryPlatform {
  constructor(matterbridge: Matterbridge, log: AnsiLogger) {
    super(matterbridge, log);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    const history = new MatterHistory(this.log, 'Eve room', { filePath: this.matterbridge.matterbridgeDirectory });

    const room = new MatterbridgeDevice(DeviceTypeDefinition(airQualitySensor));
    room.createDefaultIdentifyClusterServer();
    room.createDefaultBasicInformationClusterServer('Eve room', '0x84224975', 4874, 'Eve Systems', 0x27, 'Eve Room 20EAM9901', 1416, '3.2.1', 1, '1.1');
    room.createDefaultAirQualityClusterServer(AirQuality.AirQualityType.Good);
    room.createDefaultTvocMeasurementClusterServer();

    room.addDeviceType(DeviceTypes.TEMPERATURE_SENSOR);
    room.createDefaultTemperatureMeasurementClusterServer(20 * 100);

    room.addDeviceType(DeviceTypes.HUMIDITY_SENSOR);
    room.createDefaultRelativeHumidityMeasurementClusterServer(50 * 100);

    //room.createDefaultPowerSourceRechargableBatteryClusterServer(87);
    //room.createDefaultPowerSourceConfigurationClusterServer(1);

    // Add the EveHistory cluster to the device as last cluster!
    room.createRoomEveHistoryClusterServer(history, this.log);
    history.autoPilot(room);

    await this.registerDevice(room);

    room.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
      logEndpoint(room);
      history.logHistory(false);
    });

    room.getClusterServerById(EveHistory.Cluster.id)?.setTemperatureDisplayUnitsAttribute(TemperatureDisplayUnits.CELSIUS);

    let minTemperature = 0;
    let maxTemperature = 0;
    history.setMaxMinTemperature(maxTemperature, minTemperature);

    setInterval(
      () => {
        const airquality = AirQuality.AirQualityType.Good;
        const voc = history.getFakeLevel(0, 1000, 0);
        const temperature = history.getFakeLevel(10, 30, 2);
        if (minTemperature === 0) minTemperature = temperature;
        if (maxTemperature === 0) maxTemperature = temperature;
        minTemperature = Math.min(minTemperature, temperature);
        maxTemperature = Math.max(maxTemperature, temperature);
        const humidity = history.getFakeLevel(1, 99, 2);
        room.getClusterServerById(AirQuality.Cluster.id)?.setAirQualityAttribute(airquality);
        room.getClusterServerById(TvocMeasurement.Cluster.id)?.setMeasuredValueAttribute(voc);
        room.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMeasuredValueAttribute(temperature * 100);
        room.getClusterServerById(RelativeHumidityMeasurement.Cluster.id)?.setMeasuredValueAttribute(humidity * 100);

        history.setMaxMinTemperature(maxTemperature, minTemperature);
        history.addEntry({ time: history.now(), airquality, voc, temperature, humidity });
        this.log.info(`Set airquality: ${airquality} voc: ${voc} temperature: ${temperature} (min: ${minTemperature} max: ${maxTemperature}) humidity: ${humidity}`);
      },
      60 * 1000 - 700,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
  }
}
