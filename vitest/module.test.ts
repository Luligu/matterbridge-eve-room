const NAME = 'Platform';
const MATTER_PORT = 6000;
const MATTER_CREATE_ONLY = true;

import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { LogLevel } from 'matterbridge/logger';
import { Identify } from 'matterbridge/matter/clusters';
import { log, loggerLogSpy, setupTest } from 'matterbridge/vitest-utils';
import {
  addMatterbridge,
  createServerNode,
  createTestEnvironment,
  destroyTestEnvironment,
  flushServerNode,
  getMatterbridge,
  startServerNode,
  stopServerNode,
} from 'matterbridge/vitest-utils/matter';

import initializePlugin, { EveRoomPlatform } from '../src/module.js';

// Setup the test environment
await setupTest(NAME, false);

describe('TestPlatform', () => {
  let matterbridge: PlatformMatterbridge;
  let testPlatform: EveRoomPlatform;

  const config: PlatformConfig = {
    name: 'matterbridge-eve-room',
    type: 'AccessoryPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  beforeAll(async () => {
    // Create the Matter test environment
    await createTestEnvironment();
    await createServerNode(MATTER_PORT);
    if (!MATTER_CREATE_ONLY) await startServerNode();
    matterbridge = getMatterbridge();
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Destroy the Matter test environment
    if (MATTER_CREATE_ONLY) await flushServerNode();
    else await stopServerNode();
    await destroyTestEnvironment();
    // Restore all mocks
    vi.restoreAllMocks();
  });

  it('should return an instance of TestPlatform', async () => {
    const platform = initializePlugin(matterbridge, log, config);
    expect(platform).toBeInstanceOf(EveRoomPlatform);
    await platform.onShutdown();
  });

  it('should not initialize platform with wrong version', () => {
    expect(() => (testPlatform = new EveRoomPlatform({ ...matterbridge, matterbridgeVersion: '3.8.0' }, log, config))).toThrow(
      'This plugin requires Matterbridge version >= "3.9.0".',
    );
  });

  it('should initialize platform with config name', () => {
    testPlatform = new EveRoomPlatform(matterbridge, log, config);
    addMatterbridge(testPlatform);
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
    vi.useFakeTimers();

    await testPlatform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onConfigure called');

    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(61 * 1000);
    }

    vi.useRealTimers();

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
    testPlatform.config.unregisterOnShutdown = true;
    await testPlatform.onShutdown();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onShutdown called with reason:', 'Test reason');
  });
});
