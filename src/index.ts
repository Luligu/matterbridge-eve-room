import { Matterbridge } from 'matterbridge';
import { AnsiLogger } from 'node-ansi-logger';
import { EveRoomPlatform } from './platform.js';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param matterbridge - An instance of MatterBridge
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger) {
  return new EveRoomPlatform(matterbridge, log);
}
