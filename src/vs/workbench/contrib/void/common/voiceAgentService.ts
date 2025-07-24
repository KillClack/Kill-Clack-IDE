/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';

// Types shared between browser and main process
export interface IVoiceAgentStartParams {
	dailyRoomUrl: string;
	dailyRoomToken?: string;
	deepgramApiKey: string;
}

export interface IVoiceAgentStatusEvent {
	status: 'starting' | 'running' | 'stopped' | 'error';
	error?: string;
}

export interface IVoiceAgentDockerStatus {
	installed: boolean;
	running: boolean;
}

// Service interface
export const IVoiceAgentService = createDecorator<IVoiceAgentService>('voiceAgentService');

export interface IVoiceAgentService {
	readonly _serviceBrand: undefined;
	status: IVoiceAgentStatusEvent;
	readonly onStatusChange: Event<IVoiceAgentStatusEvent>;
	startVoiceAgent(params: IVoiceAgentStartParams): Promise<void>;
	stopVoiceAgent(): Promise<void>;
	checkDockerStatus(): Promise<IVoiceAgentDockerStatus>;
}

export class VoiceAgentService extends Disposable implements IVoiceAgentService {
	readonly _serviceBrand: undefined;
	private readonly channel: IChannel;

	private readonly _onStatusChange = this._register(new Emitter<IVoiceAgentStatusEvent>());
	readonly onStatusChange: Event<IVoiceAgentStatusEvent> = this._onStatusChange.event;

	status: IVoiceAgentStatusEvent = { status: 'stopped' }; // Default status

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();

		// Get the channel
		this.channel = this.mainProcessService.getChannel('voiceAgent');

		// Register the status change listener
		this._register(this.channel.listen<IVoiceAgentStatusEvent>('onStatusChange')(e => {
			this.status = e;
			this._onStatusChange.fire(e);
		}));
	}

	async startVoiceAgent(params: IVoiceAgentStartParams): Promise<void> {
		return this.channel.call('startVoiceAgent', params);
	}

	async stopVoiceAgent(): Promise<void> {
		return this.channel.call('stopVoiceAgent');
	}

	async checkDockerStatus(): Promise<IVoiceAgentDockerStatus> {
		return this.channel.call('checkDockerStatus');
	}
}

registerSingleton(IVoiceAgentService, VoiceAgentService, InstantiationType.Eager);
