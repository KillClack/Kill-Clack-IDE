/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { spawn, execSync, ChildProcess, ExecSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
	private dockerPath: string | null = null;
	private platform: NodeJS.Platform;

	constructor() {
		this.platform = os.platform();
		this.initializeDocker();
	}

	private initializeDocker(): void {
		try {
			this.dockerPath = this.findDockerExecutable();
			console.log(`Docker found at: ${this.dockerPath}`);
		} catch (error) {
			console.error('Docker initialization failed:', error);
		}
	}

	private getDockerPaths(): string[] {
		const paths: string[] = [];

		switch (this.platform) {
			case 'win32':
				// Windows paths
				paths.push(
					'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
					'C:\\Program Files (x86)\\Docker\\Docker\\resources\\bin\\docker.exe',
					path.join(process.env.PROGRAMFILES || '', 'Docker\\Docker\\resources\\bin\\docker.exe'),
					path.join(process.env['PROGRAMFILES(X86)'] || '', 'Docker\\Docker\\resources\\bin\\docker.exe'),
					path.join(process.env.LOCALAPPDATA || '', 'Docker\\bin\\docker.exe'),
					'docker.exe',
					'docker'
				);
				break;

			case 'darwin':
				// macOS paths
				paths.push(
					'/usr/local/bin/docker',
					'/opt/homebrew/bin/docker', // Apple Silicon
					'/usr/bin/docker',
					'/Applications/Docker.app/Contents/Resources/bin/docker',
					path.join(process.env.HOME || '', '.docker/bin/docker'),
					'docker'
				);
				break;

			case 'linux':
				// Linux paths
				paths.push(
					'/usr/bin/docker',
					'/usr/local/bin/docker',
					'/snap/bin/docker',
					'/var/lib/snapd/snap/bin/docker',
					path.join(process.env.HOME || '', '.local/bin/docker'),
					path.join(process.env.HOME || '', 'bin/docker'),
					'docker'
				);
				break;

			default:
				// Fallback for other platforms
				paths.push('docker');
		}

		// Add paths from environment
		if (process.env.PATH) {
			const pathDirs = process.env.PATH.split(path.delimiter);
			pathDirs.forEach(dir => {
				const dockerPath = path.join(dir, this.platform === 'win32' ? 'docker.exe' : 'docker');
				paths.push(dockerPath);
			});
		}

		return paths;
	}

	private findDockerExecutable(): string {
		const dockerPaths = this.getDockerPaths();

		// Remove duplicates
		const uniquePaths = [...new Set(dockerPaths)];

		// Check each path
		for (const dockerPath of uniquePaths) {
			if (dockerPath && fs.existsSync(dockerPath)) {
				try {
					// Verify it's executable
					fs.accessSync(dockerPath, fs.constants.X_OK);
					// Test if it actually works
					this.execDocker(['--version'], { stdio: 'ignore' }, dockerPath);
					return dockerPath;
				} catch {
					// Continue to next path
				}
			}
		}

		// Last resort: try system command
		try {
			this.execDocker(['--version'], { stdio: 'ignore' }, 'docker');
			return 'docker';
		} catch {
			throw new Error('Docker executable not found. Please install Docker from https://docs.docker.com/get-docker/');
		}
	}

	private getShell(): string | boolean {
		switch (this.platform) {
			case 'win32':
				return true; // Uses cmd.exe by default
			case 'darwin':
			case 'linux':
				return '/bin/sh';
			default:
				return true;
		}
	}

	private getEnhancedPath(): string {
		const basePath = process.env.PATH || '';

		switch (this.platform) {
			case 'win32':
				// Windows typically has Docker in Program Files
				return `${process.env.PROGRAMFILES}\\Docker\\Docker\\resources\\bin;${basePath}`;
			case 'darwin':
				// macOS paths
				return `/usr/local/bin:/opt/homebrew/bin:/usr/bin:${basePath}`;
			case 'linux':
				// Linux paths including snap
				return `/usr/local/bin:/usr/bin:/snap/bin:${basePath}`;
			default:
				return basePath;
		}
	}

	private execDocker(args: string[], options: ExecSyncOptions = {}, customPath?: string): Buffer | string {
		const dockerCmd = customPath || this.dockerPath || 'docker';

		if (this.platform === 'win32') {
			// On Windows, we need to handle paths differently
			const execOptions: ExecSyncOptions = {
				...options,
				env: {
					...process.env,
					PATH: this.getEnhancedPath()
				}
			};

			// Use direct command without quotes on Windows
			const command = `${dockerCmd} ${args.join(' ')}`;
			return execSync(command, execOptions);
		} else {
			// Unix-like systems
			const fullCommand = `"${dockerCmd}" ${args.join(' ')}`;
			const execOptions: ExecSyncOptions = {
				...options,
				shell: this.getShell() as string,
				env: {
					...process.env,
					PATH: this.getEnhancedPath()
				}
			};

			return execSync(fullCommand, execOptions);
		}
	}

	private spawnDocker(args: string[]): ChildProcess {
		const dockerCmd = this.dockerPath || 'docker';

		return spawn(dockerCmd, args, {
			shell: this.getShell(),
			env: {
				...process.env,
				PATH: this.getEnhancedPath()
			}
		});
	}

	private async startDockerDaemon(): Promise<void> {
		switch (this.platform) {
			case 'win32':
				// Try to start Docker Desktop on Windows
				try {
					execSync('start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', {
						stdio: 'ignore'
					});
				} catch {
					// Try alternative path
					try {
						execSync('start "" "Docker Desktop"', { stdio: 'ignore' });
					} catch {
						throw new Error('Could not start Docker Desktop on Windows');
					}
				}
				break;

			case 'darwin':
				// macOS
				try {
					execSync('open -a Docker', { stdio: 'ignore' });
				} catch {
					try {
						execSync('open -a "Docker Desktop"', { stdio: 'ignore' });
					} catch {
						throw new Error('Could not start Docker Desktop on macOS');
					}
				}
				break;

			case 'linux':
				// On Linux, Docker usually runs as a service
				try {
					// Try systemctl first (systemd)
					execSync('sudo systemctl start docker', { stdio: 'ignore' });
				} catch {
					try {
						// Try service command (older systems)
						execSync('sudo service docker start', { stdio: 'ignore' });
					} catch {
						// Docker Desktop for Linux
						try {
							execSync('systemctl --user start docker-desktop', { stdio: 'ignore' });
						} catch {
							throw new Error('Could not start Docker service on Linux. Try: sudo systemctl start docker');
						}
					}
				}
				break;
		}

		// Wait for Docker to start
		await new Promise(resolve => setTimeout(resolve, 5000));
	}

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

	private async _checkDockerStatus(): Promise<{ installed: boolean; running: boolean; path?: string }> {
		try {
			// Re-check for Docker in case it was installed after app start
			if (!this.dockerPath) {
				this.dockerPath = this.findDockerExecutable();
			}

			this.execDocker(['--version'], { stdio: 'ignore' });

			try {
				this.execDocker(['ps'], { stdio: 'ignore' });
				return { installed: true, running: true, path: this.dockerPath || undefined };
			} catch {
				return { installed: true, running: false, path: this.dockerPath || undefined };
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
			const installUrl = 'https://docs.docker.com/get-docker/';
			throw new Error(`Docker not installed. Please install Docker from: ${installUrl}`);
		}

		if (!dockerStatus.running) {
			try {
				await this.startDockerDaemon();

				// Re-check status
				const newStatus = await this._checkDockerStatus();
				if (!newStatus.running) {
					throw new Error('Docker is installed but not running. Please start Docker manually.');
				}
			} catch (error) {
				const platformSpecificHelp = this.platform === 'linux'
					? ' You may need to run: sudo systemctl start docker'
					: '';
				throw new Error(`Failed to start Docker. Please start it manually.${platformSpecificHelp}`);
			}
		}

		this.statusEmitter.fire({ status: 'starting' });

		try {
			// Pull the latest image
			console.log('Pulling voice agent image...');
			try {
				this.execDocker(['pull', 'victorrpp/killclack-voice-agent:latest'], { stdio: 'inherit' });
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

			this.voiceAgentProcess = this.spawnDocker(dockerArgs);

			this.voiceAgentProcess.on('error', (error) => {
				console.error('Voice agent error:', error);
				this.voiceAgentProcess = null;
				this.statusEmitter.fire({ status: 'error', error: error.toString() });
			});

			this.voiceAgentProcess.on('exit', (code) => {
				console.log(`Voice agent process exited with code ${code}`);
				this.voiceAgentProcess = null;
				if (code !== 0) {
					this.statusEmitter.fire({ status: 'error', error: `Process exited with code ${code}` });
				}
			});

			// Verify container is running
			setTimeout(async () => {
				try {
					const result = this.execDocker(['ps', '-q', '-f', 'name=killclack-voice-agent'], { stdio: 'pipe' });
					if (result && result.toString().trim()) {
						this.statusEmitter.fire({ status: 'running' });
						console.log('Voice agent started successfully');
					} else {
						throw new Error('Container not found');
					}
				} catch {
					this.statusEmitter.fire({ status: 'error', error: 'Container failed to start' });
				}
			}, 2000);

		} catch (error) {
			this.voiceAgentProcess = null;
			this.statusEmitter.fire({ status: 'error', error: error.toString() });
			throw error;
		}
	}

	private async _stopVoiceAgent(): Promise<void> {
		try {
			// Check if container is running
			const result = this.execDocker(['ps', '-q', '-f', 'name=killclack-voice-agent'], { stdio: 'pipe' });
			if (!result || result.toString().trim() === '') {
				console.log('No voice agent container running');
				this.voiceAgentProcess = null;
				this.statusEmitter.fire({ status: 'stopped' });
				return;
			}
		} catch {
			console.log('No voice agent container running');
			this.voiceAgentProcess = null;
			this.statusEmitter.fire({ status: 'stopped' });
			return;
		}

		try {
			// Try graceful stop
			this.execDocker(['stop', 'killclack-voice-agent'], { stdio: 'ignore' });
			this.voiceAgentProcess = null;
			this.statusEmitter.fire({ status: 'stopped' });
			console.log('Voice agent stopped gracefully');
		} catch {
			// Force kill if graceful stop fails
			try {
				this.execDocker(['kill', 'killclack-voice-agent'], { stdio: 'ignore' });
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
