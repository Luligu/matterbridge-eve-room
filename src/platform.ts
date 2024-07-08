import { AirQuality, DeviceTypes, EveHistory, RelativeHumidityMeasurement, TemperatureDisplayUnits, TemperatureMeasurement, airQualitySensor, TvocMeasurement, Matterbridge, MatterbridgeDevice, MatterbridgeAccessoryPlatform, PlatformConfig } from 'matterbridge';
import { MatterHistory } from 'matterbridge/history';
import { AnsiLogger } from 'matterbridge/logger';

export class EveRoomPlatform extends MatterbridgeAccessoryPlatform {
  room: MatterbridgeDevice | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve room', { filePath: this.matterbridge.matterbridgeDirectory });

    this.room = new MatterbridgeDevice(airQualitySensor);
    this.room.createDefaultIdentifyClusterServer();
    this.room.createDefaultBasicInformationClusterServer('Eve room', '0x84224975', 4874, 'Eve Systems', 0x27, 'Eve Room 20EAM9901', 1416, '1.2.11', 1, '1.0.0');
    this.room.createDefaultAirQualityClusterServer(AirQuality.AirQualityType.Good);
    this.room.createDefaultTvocMeasurementClusterServer();

    this.room.addDeviceType(DeviceTypes.TEMPERATURE_SENSOR);
    this.room.createDefaultTemperatureMeasurementClusterServer(20 * 100);

    this.room.addDeviceType(DeviceTypes.HUMIDITY_SENSOR);
    this.room.createDefaultRelativeHumidityMeasurementClusterServer(50 * 100);

    // this.room.addDeviceType(powerSource);
    // this.room.createDefaultPowerSourceRechargableBatteryClusterServer(87);

    // Add the EveHistory cluster to the device as last cluster!
    this.history.createRoomEveHistoryClusterServer(this.room, this.log);
    this.history.autoPilot(this.room);

    await this.registerDevice(this.room);

    this.room.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
      this.history?.logHistory(false);
    });

    this.room.getClusterServerById(EveHistory.Cluster.id)?.setTemperatureDisplayUnitsAttribute(TemperatureDisplayUnits.CELSIUS);

    this.history.setMaxMinTemperature(20, 20);
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    let minTemperature = 0;
    let maxTemperature = 0;

    this.interval = setInterval(
      () => {
        if (!this.room || !this.history) return;
        const airquality = AirQuality.AirQualityType.Good;
        const voc = this.history.getFakeLevel(0, 1000, 0);
        const temperature = this.history.getFakeLevel(10, 30, 2);
        if (minTemperature === 0) minTemperature = temperature;
        if (maxTemperature === 0) maxTemperature = temperature;
        minTemperature = Math.min(minTemperature, temperature);
        maxTemperature = Math.max(maxTemperature, temperature);
        const humidity = this.history.getFakeLevel(1, 99, 2);
        this.room.getClusterServerById(AirQuality.Cluster.id)?.setAirQualityAttribute(airquality);
        this.room.getClusterServerById(TvocMeasurement.Cluster.id)?.setMeasuredValueAttribute(voc);
        this.room.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMeasuredValueAttribute(temperature * 100);
        this.room.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMinMeasuredValueAttribute(minTemperature * 100);
        this.room.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMaxMeasuredValueAttribute(maxTemperature * 100);
        this.room.getClusterServerById(RelativeHumidityMeasurement.Cluster.id)?.setMeasuredValueAttribute(humidity * 100);

        this.history.setMaxMinTemperature(maxTemperature, minTemperature);
        this.history.addEntry({ time: this.history.now(), airquality, voc, temperature, humidity });
        this.log.info(`Set airquality: ${airquality} voc: ${voc} temperature: ${temperature} (min: ${minTemperature} max: ${maxTemperature}) humidity: ${humidity}`);
      },
      60 * 1000 - 700,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    await this.history?.close();
    clearInterval(this.interval);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
