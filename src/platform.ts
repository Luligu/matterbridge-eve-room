import {
  RelativeHumidityMeasurement,
  TemperatureMeasurement,
  airQualitySensor,
  Matterbridge,
  MatterbridgeAccessoryPlatform,
  PlatformConfig,
  AirQuality,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  MatterbridgeEndpoint,
  powerSource,
} from 'matterbridge';
import { MatterHistory } from 'matter-history';
import { AnsiLogger } from 'matterbridge/logger';

export class EveRoomPlatform extends MatterbridgeAccessoryPlatform {
  room: MatterbridgeEndpoint | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;
  minTemperature = 0;
  maxTemperature = 0;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('2.1.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "2.1.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve room', { filePath: this.matterbridge.matterbridgeDirectory, edge: this.matterbridge.edge });

    this.room = new MatterbridgeEndpoint([airQualitySensor, powerSource], { uniqueStorageKey: 'Eve room' }, this.config.debug as boolean);
    this.room.createDefaultIdentifyClusterServer();
    this.room.createDefaultBasicInformationClusterServer('Eve room', '0x84224975', 4874, 'Eve Systems', 0x27, 'Eve Room 20EAM9901', 1416, '1.2.11', 1, '1.0.0');
    this.room.createDefaultAirQualityClusterServer(AirQuality.AirQualityEnum.Good);
    this.room.createDefaultTvocMeasurementClusterServer();
    this.room.createDefaultTemperatureMeasurementClusterServer(20 * 100);
    this.room.createDefaultRelativeHumidityMeasurementClusterServer(50 * 100);

    // this.room.addDeviceType(powerSource); the Eve App has problems with this...
    this.room.createDefaultPowerSourceRechargeableBatteryClusterServer(87);

    // Add the EveHistory cluster to the device as last cluster!
    this.history.createRoomEveHistoryClusterServer(this.room, this.log);
    this.history.autoPilot(this.room);

    await this.registerDevice(this.room);

    this.room.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
      this.history?.logHistory(false);
    });

    this.room.addCommandHandler('triggerEffect', async ({ request: { effectIdentifier, effectVariant } }) => {
      this.log.warn(`Command triggerEffect called effect ${effectIdentifier} variant ${effectVariant}`);
      this.history?.logHistory(false);
    });

    this.history.setMaxMinTemperature(20, 20);
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    // await this.room?.setAttribute(EveHistory.Cluster.id, 'TemperatureDisplayUnits', TemperatureDisplayUnits.CELSIUS, this.log);

    this.interval = setInterval(
      async () => {
        if (!this.room || !this.history) return;
        const airquality = AirQuality.AirQualityEnum.Good;
        const voc = this.history.getFakeLevel(0, 1000, 0);
        const temperature = this.history.getFakeLevel(10, 30, 2);
        if (this.minTemperature === 0) this.minTemperature = temperature;
        if (this.maxTemperature === 0) this.maxTemperature = temperature;
        this.minTemperature = Math.min(this.minTemperature, temperature);
        this.maxTemperature = Math.max(this.maxTemperature, temperature);
        const humidity = this.history.getFakeLevel(1, 99, 2);
        await this.room.setAttribute(AirQuality.Cluster.id, 'airQuality', airquality);
        await this.room.setAttribute(TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, 'measuredValue', voc, this.log);
        await this.room.setAttribute(TemperatureMeasurement.Cluster.id, 'minMeasuredValue', this.minTemperature * 100, this.log);
        await this.room.setAttribute(TemperatureMeasurement.Cluster.id, 'maxMeasuredValue', this.maxTemperature * 100, this.log);
        await this.room.setAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue', temperature * 100, this.log);
        await this.room.setAttribute(RelativeHumidityMeasurement.Cluster.id, 'measuredValue', humidity * 100, this.log);

        this.history.setMaxMinTemperature(this.maxTemperature, this.minTemperature);
        this.history.addEntry({ time: this.history.now(), airquality, voc, temperature, humidity });
        this.log.info(`Set airquality: ${airquality} voc: ${voc} temperature: ${temperature} (min: ${this.minTemperature} max: ${this.maxTemperature}) humidity: ${humidity}`);
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
