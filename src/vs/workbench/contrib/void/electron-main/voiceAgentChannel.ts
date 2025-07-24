/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { spawn, execSync, ChildProcess } from 'child_process';

export interface IVoiceAgentChannelParams {
	dailyRoomUrl: string;
	dailyRoomToken?: string;
	deepgramApiKey: string;
}

export interface IVoiceAgentStatusEvent {
	status: 'starting' | 'running' | 'stopped' | 'error';
	error?: string;
}

export class VoiceAgentChannel implements IServerChannel {
	private voiceAgentProcess: ChildProcess | null = null;
	private readonly statusEmitter = new Emitter<IVoiceAgentStatusEvent>();

	constructor() { }

	listen(_: unknown, event: string): Event<any> {
		if (event === 'onStatusChange') return this.statusEmitter.event;
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, params: any): Promise<any> {
		try {
			if (command === 'startVoiceAgent') {
				return await this._startVoiceAgent(params);
			} else if (command === 'stopVoiceAgent') {
				return await this._stopVoiceAgent();
			} else if (command === 'checkDockerStatus') {
				return await this._checkDockerStatus();
			} else {
				throw new Error(`Command "${command}" not recognized.`);
			}
		} catch (e) {
			console.error('Voice Agent Channel Error:', e);
			throw e;
		}
	}

	private async _checkDockerStatus(): Promise<{ installed: boolean; running: boolean }> {
		try {
			execSync('docker --version', { stdio: 'ignore' });
			try {
				execSync('docker ps', { stdio: 'ignore' });
				return { installed: true, running: true };
			} catch {
				return { installed: true, running: false };
			}
		} catch {
			return { installed: false, running: false };
		}
	}

	private async _startVoiceAgent(params: IVoiceAgentChannelParams): Promise<void> {
		if (this.voiceAgentProcess) {
			throw new Error('Voice agent already running');
		}

		const { dailyRoomUrl, dailyRoomToken, deepgramApiKey } = params;

		// Check Docker availability
		const dockerStatus = await this._checkDockerStatus();
		if (!dockerStatus.installed) {
			throw new Error('Docker not installed. Please install Docker: https://docs.docker.com/get-docker/');
		}
		if (!dockerStatus.running) {
			// Do Open -a Docker
			execSync('open -a Docker', { stdio: 'ignore' });
		}

		this.statusEmitter.fire({ status: 'starting' });

		try {
			try {
				execSync('docker pull victorrpp/killclack-voice-agent:latest', { stdio: 'inherit' });
			} catch (error) {
				console.error('Failed to pull voice agent image:', error);
				throw new Error('Failed to pull voice agent image. Please check your internet connection.');
			}

			// Start container
			const dockerArgs = [
				'run', '--rm', '-d',
				'--name', 'killclack-voice-agent',
				'--log-driver', 'none',
				'--network', 'host',
				'-e', `DAILY_ROOM_URL=${dailyRoomUrl}`,
				'-e', `DEEPGRAM_API_KEY=${deepgramApiKey}`
			];

			if (dailyRoomToken) {
				dockerArgs.push('-e', `DAILY_ROOM_TOKEN=${dailyRoomToken}`);
			}

			dockerArgs.push('victorrpp/killclack-voice-agent:latest');

			this.voiceAgentProcess = spawn('docker', dockerArgs);

			this.voiceAgentProcess.on('error', (error) => {
				console.error('Voice agent error:', error);
				this.voiceAgentProcess = null;
				this.statusEmitter.fire({ status: 'error', error: error.toString() });
			});

			this.statusEmitter.fire({ status: 'running' });
			console.log('Voice agent started successfully');

		} catch (error) {
			this.voiceAgentProcess = null;
			this.statusEmitter.fire({ status: 'error', error: error.toString() });
			throw error;
		}
	}

	private async _stopVoiceAgent(): Promise<void> {
		try {
			// Check if container is running
			execSync('docker ps -q -f name=killclack-voice-agent', { stdio: 'ignore' });
		} catch {
			console.log('No voice agent container running');
			this.voiceAgentProcess = null;
			this.statusEmitter.fire({ status: 'stopped' });
			return;
		}

		try {
			// Try graceful stop
			execSync('docker stop killclack-voice-agent', { stdio: 'ignore' });
			this.voiceAgentProcess = null;
			this.statusEmitter.fire({ status: 'stopped' });
			console.log('Voice agent stopped gracefully');
		} catch {
			// Force kill if graceful stop fails
			try {
				execSync('docker kill killclack-voice-agent', { stdio: 'ignore' });
				this.voiceAgentProcess = null;
				this.statusEmitter.fire({ status: 'stopped' });
				console.log('Voice agent forcefully killed');
			} catch (error) {
				console.error('Failed to kill voice agent:', error);
				throw error;
			}
		}
	}

	dispose(): void {
		this._stopVoiceAgent().catch(console.error);
		this.statusEmitter.dispose();
	}
}
