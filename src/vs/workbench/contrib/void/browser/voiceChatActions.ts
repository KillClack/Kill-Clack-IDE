/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { VOICE_CHAT_VIEW_ID } from './voiceChatPanel.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { localize2 } from '../../../../nls.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';

// Register toggle action
registerAction2(class ToggleVoiceChatAction extends Action2 {
	static readonly ID = 'workbench.action.voiceChat.toggle';

	constructor() {
		super({
			id: ToggleVoiceChatAction.ID,
			title: localize2('toggleVoiceChat', 'Toggle Voice Chat'),
			f1: true,
			category: localize2('voiceChat', 'Voice Chat'),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);

		const isVisible = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.getId() === VOICE_CHAT_VIEW_ID;

		if (isVisible) {
			paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
		} else {
			await paneCompositeService.openPaneComposite(VOICE_CHAT_VIEW_ID, ViewContainerLocation.Panel, true);
		}
	}
});

// Register focus action
registerAction2(class FocusVoiceChatAction extends Action2 {
	static readonly ID = 'workbench.action.voiceChat.focus';

	constructor() {
		super({
			id: FocusVoiceChatAction.ID,
			title: localize2('focusVoiceChat', 'Focus Voice Chat'),
			f1: true,
			category: localize2('voiceChat', 'Voice Chat'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		await paneCompositeService.openPaneComposite(VOICE_CHAT_VIEW_ID, ViewContainerLocation.Panel, true);
	}
});
