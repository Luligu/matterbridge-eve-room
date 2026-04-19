const NAME = 'Platform';
const MATTER_PORT = 6000;
const MATTER_CREATE_ONLY = true;

import { jest } from '@jest/globals';
import { PlatformConfig } from 'matterbridge';
import {
  addMatterbridgePlatform,
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  log,
  loggerLogSpy,
  matterbridge,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
} from 'matterbridge/jestutils';
import { LogLevel } from 'matterbridge/logger';
import { Identify } from 'matterbridge/matter/clusters';

import initializePlugin, { EveRoomPlatform } from './module.js';

// Setup the test environment
setupTest(NAME, false);

describe('TestPlatform', () => {
  let testPlatform: EveRoomPlatform;

  const config: PlatformConfig = {
    name: 'matterbridge-eve-room',
    type: 'AccessoryPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  beforeAll(async () => {
    // Create Matterbridge environment
    await createMatterbridgeEnvironment();
    await startMatterbridgeEnvironment(MATTER_PORT, MATTER_CREATE_ONLY);
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    await stopMatterbridgeEnvironment(MATTER_CREATE_ONLY);
    await destroyMatterbridgeEnvironment(undefined, undefined, !MATTER_CREATE_ONLY);
    // Restore all mocks
    jest.restoreAllMocks();
  });

  it('should return an instance of TestPlatform', async () => {
    const platform = initializePlugin(matterbridge, log, config);
    expect(platform).toBeInstanceOf(EveRoomPlatform);
    await platform.onShutdown();
  });

  it('should not initialize platform with wrong version', () => {
    matterbridge.matterbridgeVersion = '1.5.0';
    expect(() => (testPlatform = new EveRoomPlatform(matterbridge, log, config))).toThrow();
    matterbridge.matterbridgeVersion = '3.5.0';
  });

  it('should initialize platform with config name', () => {
    testPlatform = new EveRoomPlatform(matterbridge, log, config);
    addMatterbridgePlatform(testPlatform);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Initializing platform:', config.name);
  });

  it('should call onStart with reason', async () => {
    await testPlatform.onStart('Test reason');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onStart called with reason:', 'Test reason');
    expect(testPlatform.room).toBeDefined();
    if (!testPlatform.room) return;
    expect(testPlatform.room.getAllClusterServerNames()).toEqual([
      'descriptor',
      'matterbridge',
      'identify',
      'airQuality',
      'totalVolatileOrganicCompoundsConcentrationMeasurement',
      'temperatureMeasurement',
      'relativeHumidityMeasurement',
      'powerSource',
      'eveHistory',
    ]);
  });

  it('should call onConfigure', async () => {
    jest.useFakeTimers();

    await testPlatform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onConfigure called');

    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(61 * 1000);
    }

    jest.useRealTimers();

    expect(loggerLogSpy).toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
  });

  it('should execute the commandHandlers', async () => {
    expect(testPlatform.room).toBeDefined();
    if (!testPlatform.room) return;
    expect(Object.keys(testPlatform.room.behaviors.supported)).toHaveLength(9); // ["descriptor", "matterbridge", "identify", "airQuality", "totalVolatileOrganicCompoundsConcentrationMeasurement", "temperatureMeasurement", "relativeHumidityMeasurement", "powerSource", "eveHistory"]

    await testPlatform.room.executeCommandHandler('identify', { identifyTime: 5 }, 'identify', {} as any, testPlatform.room);
    await testPlatform.room.executeCommandHandler(
      'triggerEffect',
      { effectIdentifier: Identify.EffectIdentifier.Blink, effectVariant: Identify.EffectVariant.Default },
      'identify',
      {} as any,
      testPlatform.room,
    );
  });

  it('should call onShutdown with reason', async () => {
    await testPlatform.onShutdown('Test reason');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onShutdown called with reason:', 'Test reason');
  });
});
