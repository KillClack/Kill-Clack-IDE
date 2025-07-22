/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import {
	Extensions as ViewContainerExtensions, IViewContainersRegistry,
	ViewContainerLocation, IViewsRegistry, Extensions as ViewExtensions,
	IViewDescriptorService,
} from '../../../common/views.js';
import * as nls from '../../../../nls.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { mountVoiceChat } from './react/out/voice-chat-tsx/index.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';

// Constants
export const VOICE_CHAT_VIEW_ID = 'workbench.panel.voiceChat';

// Voice Chat View Pane
class VoiceChatViewPane extends ViewPane {
	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService)

	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		// Style the container
		parent.style.padding = '0';
		parent.style.overflow = 'hidden';
		parent.style.height = '100%';

		// Mount React component
		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountVoiceChat(parent, accessor)?.dispose;
			this._register(toDisposable(() => disposeFn?.()));
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}

// Register the view container (following terminal pattern)
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: VOICE_CHAT_VIEW_ID,
	title: nls.localize2('voiceChat', 'Voice Chat'),
	icon: Codicon.unmute,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VOICE_CHAT_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: VOICE_CHAT_VIEW_ID,
	hideIfEmpty: false,
	order: 4, // After terminal
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true, isDefault: false });

// Register the view
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: VOICE_CHAT_VIEW_ID,
	name: nls.localize2('voiceChat', 'Voice Chat'),
	containerIcon: Codicon.unmute,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(VoiceChatViewPane),
	openCommandActionDescriptor: {
		id: 'workbench.action.voiceChat.toggle',
		mnemonicTitle: nls.localize({ key: 'miToggleVoiceChat', comment: ['&& denotes a mnemonic'] }, "&&Voice Chat"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
		},
		order: 4
	}
}], VIEW_CONTAINER);
