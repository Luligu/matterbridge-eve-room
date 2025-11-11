/**
 * This file contains the class EveRoomPlatform.
 *
 * @file module.ts
 * @author Luca Liguori
 * @version 2.0.0
 * @license Apache-2.0
 *
 * Copyright 2023, 2024, 2025, 2026 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { airQualitySensor, MatterbridgeAccessoryPlatform, PlatformConfig, MatterbridgeEndpoint, powerSource, PlatformMatterbridge } from 'matterbridge';
import { RelativeHumidityMeasurement, TemperatureMeasurement, AirQuality, TotalVolatileOrganicCompoundsConcentrationMeasurement, PowerSource } from 'matterbridge/matter/clusters';
import { EveHistory, MatterHistory, TemperatureDisplayUnits } from 'matter-history';
import { AnsiLogger } from 'matterbridge/logger';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 *  @param {PlatformMatterbridge} matterbridge - The Matterbridge instance.
 *  @param {AnsiLogger} log - The logger instance for logging messages.
 *  @param {PlatformConfig} config - The configuration for the platform.
 *  @returns {EveRoomPlatform} - An instance of the EveRoomPlatform.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig): EveRoomPlatform {
  return new EveRoomPlatform(matterbridge, log, config);
}

export class EveRoomPlatform extends MatterbridgeAccessoryPlatform {
  room: MatterbridgeEndpoint | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;
  minTemperature = 0;
  maxTemperature = 0;

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.3.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.3.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve room', { filePath: this.matterbridge.matterbridgeDirectory, enableDebug: this.config.debug as boolean });

    this.room = new MatterbridgeEndpoint(
      [airQualitySensor, powerSource],
      { id: 'Eve room', mode: this.matterbridge.bridgeMode === 'bridge' ? 'server' : undefined },
      this.config.debug,
    );
    this.room.createDefaultIdentifyClusterServer();
    this.room.createDefaultBasicInformationClusterServer('Eve room', '0x84224975', 4874, 'Eve Systems', 0x27, 'Eve Room 20EAM9901', 1416, '1.2.11', 1, '1.0.0');
    this.room.createDefaultAirQualityClusterServer(AirQuality.AirQualityEnum.Good);
    this.room.createDefaultTvocMeasurementClusterServer(100);
    this.room.createDefaultTemperatureMeasurementClusterServer(20 * 100);
    this.room.createDefaultRelativeHumidityMeasurementClusterServer(50 * 100);
    this.room.createDefaultPowerSourceRechargeableBatteryClusterServer(87, PowerSource.BatChargeLevel.Ok, 1500, PowerSource.BatReplaceability.UserReplaceable);

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

    await this.room?.setAttribute(EveHistory.Cluster.id, 'temperatureDisplayUnits', TemperatureDisplayUnits.CELSIUS, this.log);

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
