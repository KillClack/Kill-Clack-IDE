/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ModelDropdown } from '../void-settings-tsx/ModelDropdown.js';
import { ChatModeDropdown } from '../sidebar-tsx/SidebarChat.js';
import DailyIframe, {
  DailyCall,
  DailyEventObjectAppMessage,
} from '@daily-co/daily-js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { Severity } from '../../../../../../../platform/notification/common/notification.js';
import { useIsDark } from '../util/services.js';
import { Mic, MicOff, Phone, PhoneOff, ChevronDown, X, Square, Plus, Settings } from 'lucide-react';
import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useSettingsState } from '../util/services.js';
import { builtinToolNameToComponent, MCPToolWrapper, ToolRequestAcceptRejectButtons, voidOpenFileFn, getRelative, getBasename } from '../sidebar-tsx/SidebarChat.js';
import { ChatMarkdownRender, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
import { StagingSelectionItem } from '../../../../common/chatThreadServiceTypes.js';
import { File, Folder, Text } from 'lucide-react';
import { ChatMessage, ToolMessage } from '../../../../common/chatThreadServiceTypes.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import { isABuiltinToolName} from '../../../../common/prompt/prompts.js';
import { VOICE_CHAT_VIEW_ID } from '../../../voiceChatPanel.js';
import { ViewContainerLocation } from '../../../../../../common/views.js';
import { ChatBubble } from '../sidebar-tsx/SidebarChat.js';
import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../voidSettingsPane.js';
import { VOID_CMD_SHIFT_L_ACTION_ID } from '../../../sidebarActions.js';
import { useVoiceAgentStatus } from '../util/services.js';
import '../styles.css';

// Custom SelectedFiles component for voice chat that doesn't wrap
const VoiceChatSelectedFiles = ({ selections, setSelections }: {
  selections: StagingSelectionItem[],
  setSelections: (s: StagingSelectionItem[]) => void
}) => {
  const accessor = useAccessor();

  if (selections.length === 0) {
    return null;
  }

  return (
    <div className='flex items-center flex-nowrap text-left relative gap-x-0.5 pb-0.5' style={{ flexWrap: 'nowrap' }}>
      {selections.map((selection, i) => {
        const thisKey = selection.type === 'CodeSelection'
          ? selection.type + selection.language + selection.range + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
          : selection.type === 'File'
            ? selection.type + selection.language + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
            : selection.type === 'Folder'
              ? selection.type + selection.language + selection.state + selection.uri.fsPath
              : i;

        const SelectionIcon = (
          selection.type === 'File' ? File
            : selection.type === 'Folder' ? Folder
              : selection.type === 'CodeSelection' ? Text
                : (undefined as never)
        );

        return (
          <div key={thisKey} className='flex flex-col space-y-[1px] flex-shrink-0'>
            <span
              className="truncate overflow-hidden text-ellipsis"
              data-tooltip-id='void-tooltip'
              data-tooltip-content={getRelative(selection.uri, accessor)}
              data-tooltip-place='top'
              data-tooltip-delay-show={3000}
            >
              <div className={`
                flex items-center gap-1 relative
                px-1
                w-fit h-fit
                select-none
                text-xs text-nowrap
                border rounded-sm
                bg-void-bg-1 hover:brightness-95 text-void-fg-1
                border-void-border-1
                hover:border-void-border-1
                transition-all duration-150
                cursor-pointer
              `}
              onClick={() => {
                if (selection.type === 'File') {
                  voidOpenFileFn(selection.uri, accessor);
                } else if (selection.type === 'CodeSelection') {
                  voidOpenFileFn(selection.uri, accessor, selection.range);
                } else if (selection.type === 'Folder') {
                  // TODO: reveal in tree (same as SidebarChat)
                }
              }}>
                {<SelectionIcon size={10} />}
                {getBasename(selection.uri.fsPath) +
                  (selection.type === 'CodeSelection' ? ` (${selection.range[0]}-${selection.range[1]})` : '')}

                {/* X button to remove selection */}
                <div
                  className='cursor-pointer z-1 self-stretch flex items-center justify-center'
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelections([...selections.slice(0, i), ...selections.slice(i + 1)]);
                  }}
                >
                  <X
                    className='stroke-[2]'
                    size={10}
                  />
                </div>
              </div>
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Add this component after VoiceChatSelectedFiles (around line 175)
const VoiceChatSelectedFilesWrapping = ({ selections }: { selections: StagingSelectionItem[] }) => {
  const accessor = useAccessor();

  if (selections.length === 0) {
    return null;
  }

  return (
    <div className='flex items-center flex-wrap text-left relative gap-x-0.5 gap-y-1 pb-0.5'>
      {selections.map((selection, i) => {
        const thisKey = selection.type === 'CodeSelection'
          ? selection.type + selection.language + selection.range + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
          : selection.type === 'File'
            ? selection.type + selection.language + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
            : selection.type === 'Folder'
              ? selection.type + selection.language + selection.state + selection.uri.fsPath
              : i;

        const SelectionIcon = (
          selection.type === 'File' ? File
            : selection.type === 'Folder' ? Folder
              : selection.type === 'CodeSelection' ? Text
                : (undefined as never)
        );

        return (
          <div key={thisKey} className='flex flex-col space-y-[1px]'>
            <span
              className="truncate overflow-hidden text-ellipsis"
              data-tooltip-id='void-tooltip'
              data-tooltip-content={getRelative(selection.uri, accessor)}
              data-tooltip-place='top'
              data-tooltip-delay-show={3000}
            >
              <div className={`
                flex items-center gap-1 relative
                px-1
                w-fit h-fit
                select-none
                text-xs text-nowrap
                border rounded-sm
                bg-void-bg-1 hover:brightness-95 text-void-fg-1
                border-void-border-1
                hover:border-void-border-1
                transition-all duration-150
                cursor-pointer
              `}
                onClick={() => {
                  if (selection.type === 'File') {
                    voidOpenFileFn(selection.uri, accessor);
                  } else if (selection.type === 'CodeSelection') {
                    voidOpenFileFn(selection.uri, accessor, selection.range);
                  } else if (selection.type === 'Folder') {
                    // TODO: reveal in tree
                  }
                }}
              >
                {<SelectionIcon size={10} />}
                {getBasename(selection.uri.fsPath) +
                  (selection.type === 'CodeSelection' ? ` (${selection.range[0]}-${selection.range[1]})` : '')}
              </div>
            </span>
          </div>
        );
      })}
    </div>
  );
};

const TranscriptDisplay = ({ transcript, setCurrentTranscript, sendAppMessage, currentTranscriptRef }: { transcript: string, setCurrentTranscript: (transcript: string) => void, sendAppMessage: (messageObject: any) => void, currentTranscriptRef: React.RefObject<string> }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(transcript);

  useEffect(() => {
    // Early return if no transcript
    if (!transcript) {
      setDisplayText('');
    }

    const container = containerRef.current;
    if (!container) {
      // If container not ready yet, just show the full transcript
      setDisplayText(transcript);
      return;
    }

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      try {
        // The label text that will always show
        const labelText = "LIVE TRANSCRIPT";

        // Create a temporary span to measure text width
        const measureSpan = document.createElement('span');
        measureSpan.style.visibility = 'hidden';
        measureSpan.style.position = 'absolute';
        measureSpan.style.fontSize = '14px'; // Match the text-xs class
        measureSpan.style.whiteSpace = 'nowrap';

        // Try to get font family, fallback to default if not available
        try {
          measureSpan.style.fontFamily = getComputedStyle(container).fontFamily;
        } catch (e) {
          measureSpan.style.fontFamily = 'inherit';
        }

        document.body.appendChild(measureSpan);

        // First measure the label width
        measureSpan.textContent = labelText;
        const labelWidth = measureSpan.offsetWidth;

        // Then measure the full transcript width
        measureSpan.textContent = transcript;
        const textWidth = measureSpan.offsetWidth;

        // Get available width for transcript (container width - padding - label width)
        const containerWidth = container.offsetWidth - 24; // Account for padding
        const availableWidth = containerWidth - labelWidth - 8; // Extra buffer for gap

        document.body.removeChild(measureSpan);

        if (textWidth > availableWidth && availableWidth > 0) {
          // Calculate how many characters we can show
          const avgCharWidth = textWidth / transcript.length;
          const maxChars = Math.floor(availableWidth / avgCharWidth) - 3; // Reserve space for '...'

          if (maxChars > 0) {
            setDisplayText('...' + transcript.slice(-(maxChars)));
          } else {
            setDisplayText(transcript);
          }
        } else {
          setDisplayText(transcript);
        }
      } catch (error) {
        console.error('Error in TranscriptDisplay:', error);
        // Fallback to showing full transcript
        setDisplayText(transcript);
      }
    });
  }, [transcript]);

  return (
    <div className="border-t border-void-border-3" style={{
      background: 'linear-gradient(90deg, var(--void-bg-1) 0%, var(--void-bg-2-alt) 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated left border */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '3px',
        background: 'var(--void-link-color)',
        animation: 'pulse 2s ease-in-out infinite'
      }} />

      <div ref={containerRef} className="px-4 py-2 flex items-center gap-2 text-xs whitespace-nowrap overflow-hidden">
        <span className="text-void-fg-3 flex-shrink-0 font-semibold flex items-center gap-2" style={{
          textTransform: 'uppercase',
          fontSize: '0.7rem',
          letterSpacing: '0.5px'
        }}>
          LIVE TRANSCRIPT
          {/* Animated recording dot */}
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            background: '#ef4444',
            borderRadius: '50%',
            animation: 'blink 1.5s ease-in-out infinite'
          }} />
        </span>
        <span className="text-void-fg-1 overflow-hidden font-medium" style={{
          animation: 'typewriter 0.3s ease-out',
          fontSize: '0.875rem'
        }}>
          {displayText}
        </span>

        {/* Cancel button */}
        {transcript && (
          <button
            onClick={() => {
              const messageObject = {
                type: "clear_current_transcript",
                content: "Clear current transcript",
              };
              sendAppMessage(messageObject);
              setCurrentTranscript('');
              currentTranscriptRef.current = '';
            }}
            className="ml-auto p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors flex-shrink-0"
            title="Cancel transcript"
            style={{
              marginLeft: 'auto'
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Add animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes typewriter {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export const VoiceChat = () => {
  const developmentModeRef = useRef<boolean>(true);

  const [isCodyAsleep, setIsCodyAsleep] = useState(false);

  const accessor = useAccessor();
  const chatThreadsService = accessor.get('IChatThreadService');
  const commandService = accessor.get('ICommandService');
  const paneCompositeService = accessor.get('IPaneCompositePartService');
  const notificationService = accessor.get('INotificationService');
  const voiceAgentService = accessor.get('IVoiceAgentService');
  const voiceAgentProcessStatus = useVoiceAgentStatus();
  const settingsState = useSettingsState();

  const [currentTranscript, setCurrentTranscript] = useState('');
  const currentTranscriptRef = useRef('');

  // Get current thread data
  const chatThreadsState = useChatThreadsState();
  const currentThread = chatThreadsService.getCurrentThread();
  const selections = currentThread.state.stagingSelections;
  const setSelections = (s: StagingSelectionItem[]) => {
    chatThreadsService.setCurrentThreadState({ stagingSelections: s });
  };
  const currThreadStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId);

  // State
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // Refs
  const dailyRoomName = useRef<string | null>(null);
  const callObjectRef = useRef<DailyCall | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollHeight = useRef<number>(0);

  const currCheckpointIdx = chatThreadsState.allThreads[currentThread.id]?.state?.currCheckpointIdx ?? undefined;

  const keepAliveRef = useRef<{ status: string; lastTime: number }>({
    status: 'OK',
    lastTime: 0,
  });


  // Get streaming message if available
  const streamingMessage = useMemo(() => {
    const { displayContentSoFar, reasoningSoFar } = currThreadStreamState?.llmInfo ?? {};

    if (displayContentSoFar || reasoningSoFar) {
      return {
        role: 'assistant',
        displayContent: displayContentSoFar ?? '',
        reasoning: reasoningSoFar ?? '',
        anthropicReasoning: null,
      } as ChatMessage & { role: 'assistant' };
    }

    return null;
  }, [currThreadStreamState]);

  // Auto-scroll to bottom function
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
    setIsUserScrolling(!isAtBottom);
  }, []);

  // Send App message
  const sendAppMessage = useCallback((messageObject: any) => {
    if (!callObject) return;

    try {
      callObject.sendAppMessage(messageObject, '*');
      console.log('App message sent:', messageObject);
    } catch (error) {
      console.error('Error sending app message:', error);
    }
  }, [callObject]);

  // Initialize Daily call
  const initializeCall = useCallback(async () => {
    if (isConnecting || isConnected) return;

    if (!(settingsState.globalSettings.dailyApiKey && settingsState.globalSettings.dailyRoomDomain && settingsState.globalSettings.deepgramApiKey)) {
        notificationService.notify({
            severity: Severity.Warning,
            message: 'Please configure Daily API key, room domain, and Deepgram API key in settings.'
        });
        await commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID);
        return;
    }

    setIsConnecting(true);
    let dailyRoomUrl = '';
    let dailyRoomToken = undefined;
    if (!developmentModeRef.current) {
      // Generate unique room name
      const roomName = `voice-chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      dailyRoomName.current = roomName;
      dailyRoomUrl = `https://${settingsState.globalSettings.dailyRoomDomain}/${roomName}`;

      // Create the room
      const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settingsState.globalSettings.dailyApiKey}`,
      };
      const roomPayload = {
          name: roomName,
          privacy: 'private',
          properties: {
              start_video_off: true,
          },
      };

      try {
          await fetch('https://api.daily.co/v1/rooms/', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(roomPayload),
          });
      } catch (error) {
          console.error('Failed to create Daily room:', error);
          setIsConnecting(false);
          notificationService.notify({
              severity: Severity.Error,
              message: 'Failed to create voice chat room'
          });
          return;
      }

      // Create access token
      const tokenPayload = {
          properties: {
              room_name: roomName,
              permissions: {
                  canAdmin: ['participants'],
                  canSend: true,
              },
          },
      };
      try {
          const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens/', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(tokenPayload),
          });
          const tokenData = await tokenResponse.json();
          dailyRoomToken = tokenData.token;
      } catch (error) {
          console.error('Failed to create Daily access token:', error);
          setIsConnecting(false);
          notificationService.notify({
              severity: Severity.Error,
              message: 'Failed to create access token'
          });
          return;
      }
    } else {
      dailyRoomUrl = 'https://victordev.daily.co/sample'
    }

    try {
      if (!developmentModeRef.current) {
        // Start voice agent first
        await voiceAgentService.startVoiceAgent({
            dailyRoomUrl: dailyRoomUrl,
            dailyRoomToken: dailyRoomToken,
            deepgramApiKey: settingsState.globalSettings.deepgramApiKey
        });
      }
      // Create call object similar to PropertyChat
      const newCallObject: DailyCall = (DailyIframe as any).createCallObject({
        dailyConfig: {
          avoidEval: true
        }
      });

      // Update audio input settings
      newCallObject.updateInputSettings({
        audio: {
          processor: {
            type: 'noise-cancellation',
          },
        },
      });

      // Set local audio on, video off
      newCallObject.setLocalAudio(true);
      newCallObject.setLocalVideo(false);

      callObjectRef.current = newCallObject;
      setCallObject(newCallObject);

      // Join the meeting
      const joinParams: any = {
          url: dailyRoomUrl,
          userName: "User",
          videoSource: false,
      };
      if (dailyRoomToken) {
        joinParams.token = dailyRoomToken;
      }

      // Join with the configured settings
      await newCallObject.join(joinParams);

    } catch (error: any) {
      console.error('Failed to initialize call:', error);
      setIsConnecting(false);
      notificationService.notify({
          severity: Severity.Error,
          message: error || 'Failed to start voice chat'
      });
    }
  }, [isConnecting, isConnected, settingsState.globalSettings.dailyApiKey, settingsState.globalSettings.dailyRoomDomain, settingsState.globalSettings.deepgramApiKey]);

  // Handle app messages
  const handleAppMessage = useCallback((event: DailyEventObjectAppMessage) => {
    if (event.fromId === 'local') return;

    const messageType = event.data?.type;
    const content = event.data?.content;

    // Handle activate/deactivate messages
    if (messageType === 'deactivate') {
      setIsCodyAsleep(true);
    }

    if (messageType === 'activate') {
      setIsCodyAsleep(false);
      // Force open the voice chat panel
      paneCompositeService.openPaneComposite(VOICE_CHAT_VIEW_ID, ViewContainerLocation.Panel, true)
        .catch(console.error);
    }

    // Handle transcript updates
    if (messageType === 'latest_transcript') {
      setCurrentTranscript(content || '');
      currentTranscriptRef.current = content || '';
    }

    // Handle turn completed - send transcript as message and reset transcript
    if (messageType === 'turn_completed') {
      const transcriptToSubmit = currentTranscriptRef.current;

      if (transcriptToSubmit && transcriptToSubmit.trim()) {
        // Toggle the voice chat panel if not already open
        // Get current thread ID at the time of execution
        const currentThreadId = chatThreadsService.getCurrentThread().id;

        const submitTranscript = async () => {
          try {
            await chatThreadsService.addUserMessageAndStreamResponse({
              userMessage: transcriptToSubmit,
              threadId: currentThreadId
            });
          } catch (e) {
            console.error('Error while sending transcript message:', e);
          }
        };
        paneCompositeService.openPaneComposite(VOICE_CHAT_VIEW_ID, ViewContainerLocation.Panel, true)
          .then(() => {
            // If the chat thread is running, abort it before submitting
          chatThreadsService.abortRunning(currentThreadId).then(() => {
            submitTranscript();
          });
        }).catch(console.error);
      }
      // Clear staging
      chatThreadsService.setCurrentThreadState({ stagingSelections: [] });
      setCurrentTranscript('');
      currentTranscriptRef.current = '';
    }

    // Handle keepalive
    if (messageType === 'keepalive') {
      keepAliveRef.current = {
        status: 'OK',
        lastTime: Date.now(),
      };
    }
  }, [currThreadStreamState, chatThreadsService, isCodyAsleep]);

  // Join meeting handler
  const joinMeeting = useCallback(async () => {
    console.log('Joined meeting successfully');
  }, []);

  // Left meeting handler
  const leftMeeting = useCallback(() => {
    setIsConnected(false);
    console.log('Left meeting');
  }, []);

  // Participant joined handler (AI agent joined)
  const handleParticipantJoined = useCallback((participant: any) => {
      console.log('Participant joined:', participant);
      setIsConnected(true);
      setIsConnecting(false);
    }, []);

  // Network connection handler
  const handleNetworkConnection = useCallback((event: any) => {
    if (event?.type === 'signaling') {
      if (event?.event === 'connected') {
        console.log('Network connection re-established');
      } else if (event?.event === 'interrupted') {
        console.log('Network connection lost');
      }
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!callObject) return;

    // Connection events
    callObject.on('joined-meeting', joinMeeting);

    callObject.on('participant-joined', handleParticipantJoined);

    callObject.on('left-meeting', leftMeeting);

    // Message events
    callObject.on('app-message', handleAppMessage);

    // Network events
    callObject.on('network-connection', handleNetworkConnection);

    // Cleanup
    return () => {
      callObject.off('app-message', handleAppMessage);
      callObject.off('joined-meeting', joinMeeting);
      callObject.off('participant-joined', handleParticipantJoined);
      callObject.off('left-meeting', leftMeeting);
      callObject.off('network-connection', handleNetworkConnection);
    };
  }, [callObject, handleAppMessage, joinMeeting, leftMeeting, handleNetworkConnection, isCodyAsleep]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (container.scrollHeight !== lastScrollHeight.current) {
      lastScrollHeight.current = container.scrollHeight;

      const isStreamingOrLoading = streamingMessage || currThreadStreamState?.isRunning === 'LLM' || currThreadStreamState?.isRunning === 'idle';

      if (!isUserScrolling || isStreamingOrLoading) {
        scrollToBottom();
      }
    }
  }, [
    currentThread.messages, // Watch all messages instead of just recent ones
    streamingMessage,
    scrollToBottom,
    isUserScrolling,
    currThreadStreamState?.isRunning
  ]);
  // Handle parent resize events
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Add scroll listener
    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Initial scroll on mount
  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!callObject) return;

    const newMutedState = !isMuted;
    callObject.setLocalAudio(!newMutedState);
    setIsMuted(newMutedState);
  }, [callObject, isMuted]);

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!callObject) return;

    try {

      await callObject.leave();
      await callObject.destroy();
      setCallObject(null);
      callObjectRef.current = null;
      setIsConnected(false);
      setParticipants({});
      if (!developmentModeRef.current) {
        // Stop voice agent
        await voiceAgentService.stopVoiceAgent();
        // Delete the room
        if (dailyRoomName.current && settingsState.globalSettings.dailyApiKey) {
          const headers = {
              Authorization: `Bearer ${settingsState.globalSettings.dailyApiKey}`,
          };
          try {
              await fetch(`https://api.daily.co/v1/rooms/${dailyRoomName.current}`, {
                    method: 'DELETE',
                    headers: headers,
                });
            } catch (error) {
                console.error('Error deleting Daily room:', error);
            }
        }
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }, [callObject, settingsState.globalSettings.dailyApiKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        const cleanup = async () => {
            if (callObjectRef.current) {
                try {
                    await callObjectRef.current.leave();
                    await callObjectRef.current.destroy();
                } catch (error) {
                    console.error('Cleanup error:', error);
                }
            }
            if (!developmentModeRef.current) {
              // Delete the room
              if (dailyRoomName.current && settingsState.globalSettings.dailyApiKey) {
                const headers = {
                    Authorization: `Bearer ${settingsState.globalSettings.dailyApiKey}`,
                };
                try {
                    await fetch(`https://api.daily.co/v1/rooms/${dailyRoomName.current}`, {
                          method: 'DELETE',
                          headers: headers,
                      });
                  } catch (error) {
                      console.error('Error deleting Daily room:', error);
                  }
              }
              // Stop voice agent on unmount
              await voiceAgentService.stopVoiceAgent();
            }
        };
        cleanup().catch(console.error);
    };
}, [voiceAgentService, settingsState.globalSettings.dailyApiKey]);



  // Listen to status changes
  useEffect(() => {
      if (voiceAgentProcessStatus.status === 'error')
        {
          notificationService.notify({
              severity: Severity.Error,
              message: `Voice agent error: ${voiceAgentProcessStatus.error}`
          });
      }
  }, [voiceAgentProcessStatus, notificationService]);

  const isDark = useIsDark()

  return (
    <ErrorBoundary>
      <div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
        <div className="w-full h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1 text-void-fg-1 text-xs border-b border-void-border-3" style={{
            background: 'linear-gradient(180deg, var(--void-bg-2) 0%, var(--void-bg-2-alt) 100%)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
          }}>
            {/* Left side - Status and connection info */}
            <div className="flex items-center gap-2">
              {/* Status indicator */}
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  isCodyAsleep ? 'bg-gray-400' :
                  isConnected ? 'bg-green-500' :
                  isConnecting ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-500'
                }`} />
                <span className="font-medium">Cody</span>
              </div>

              {/* Connection status */}
              <span className="text-void-fg-3">
                {isCodyAsleep ? 'Sleeping' :
                isConnected ? 'Connected' :
                isConnecting ? 'Connecting...' :
                'Disconnected'}
              </span>

              {/* Sleeping indicator with pulsing Zzz */}
              {isCodyAsleep && (
                <span className="text-void-fg-4 text-xs animate-pulse">
                  💤
                </span>
              )}
            </div>

            {/* Middle - General controls */}
            <div className="flex items-center gap-1">
              {/* 1. Chat Mode Dropdown */}
              <ChatModeDropdown className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-2 rounded py-0.5 px-1' />

              {/* 2. Model Dropdown */}
              <ModelDropdown featureName='Chat' className='text-xs text-void-fg-3 bg-void-bg-1 rounded py-0.5 px-1' />

              {/* 3. New chat button */}
              <button
                onClick={() => {commandService.executeCommand(VOID_CMD_SHIFT_L_ACTION_ID)}}
                className="p-1 rounded hover:bg-void-bg-3 transition-colors"
                title="New chat"
              >
                <Plus size={14} />
              </button>

              {/* 4. Settings button */}
              <button
                onClick={() => {
                  commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID);
                }}
                className="p-1 rounded hover:bg-void-bg-3 transition-colors"
                title="Open settings"
              >
                <Settings size={14} />
              </button>
            </div>

            {/* Right side - Call controls */}
            <div className="flex items-center gap-1">
              {/* 5. Mute button - only when connected */}
              {isConnected && (
                <button
                  onClick={toggleMute}
                  className="p-1 rounded hover:bg-void-bg-3 transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}

              {/* 6. Connect/disconnect button */}
              <button
                onClick={isConnected ? disconnect : initializeCall}
                disabled={isConnecting}
                className={`p-1 rounded transition-colors ${
                  isConnected ? 'hover:bg-red-500/20 text-red-500' : 'hover:bg-green-500/20 text-green-500'
                } disabled:opacity-50`}
                title={isConnected ? 'Disconnect' : 'Connect'}
              >
                {isConnected ? <PhoneOff size={14} /> : <Phone size={14} />}
              </button>
            </div>
          </div>

          {/* Messages container - fills remaining space */}
          <div className="w-full flex-1 overflow-hidden relative">
            {/* Sleep overlay */}
            {isCodyAsleep && isConnected && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(2px)'
                }}
              >
                <div className="text-center p-6 rounded-lg max-w-sm"
                  style={{
                    background: 'var(--void-bg-2)',
                    border: '1px solid var(--void-border-2)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  {/* Animated sleeping icon */}
                  <div className="text-6xl mb-4" style={{ animation: 'float 3s ease-in-out infinite' }}>
                    😴
                  </div>
                  <h3 className="text-void-fg-1 text-lg font-semibold mb-2">
                    Cody is asleep
                  </h3>
                  <p className="text-void-fg-3 text-sm">
                    Say "Hey there Cody" to wake him up
                  </p>
                </div>
              </div>
            )}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="w-full h-full p-3 space-y-4 overflow-y-auto"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--void-border-2) transparent'
              }}
            >
              {/* Render all previous messages like SidebarChat does */}
              {currentThread.messages.map((message, i) => {
                return <ChatBubble
                  key={i}
                  currCheckpointIdx={currCheckpointIdx}
                  chatMessage={message}
                  messageIdx={i}
                  isCommitted={true}
                  chatIsRunning={currThreadStreamState?.isRunning}
                  threadId={currentThread.id}
                  _scrollToBottom={() => scrollToBottom()}
                />
              })}

              {/* Show streaming message if available */}
              {streamingMessage && (
                <ChatBubble
                  key={'curr-streaming-msg'}
                  currCheckpointIdx={currCheckpointIdx}
                  chatMessage={{
                    role: 'assistant',
                    displayContent: streamingMessage.displayContent ?? '',
                    reasoning: streamingMessage.reasoning ?? '',
                    anthropicReasoning: null,
                  }}
                  messageIdx={currentThread.messages.length}
                  isCommitted={false}
                  chatIsRunning={currThreadStreamState?.isRunning}
                  threadId={currentThread.id}
                  _scrollToBottom={null}
                />
              )}

              {/* Loading indicator */}
              {(currThreadStreamState?.isRunning === 'LLM' || currThreadStreamState?.isRunning === 'idle') && !streamingMessage && (
                <div className="flex items-center gap-2 text-void-fg-3 text-sm py-2">
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid var(--void-border-2)',
                    borderTopColor: 'var(--void-link-color)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <span>Thinking...</span>
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                </div>
              )}

              {/* Show empty state if no messages */}
              {currentThread.messages.length === 0 && !streamingMessage && currThreadStreamState?.isRunning !== 'LLM' && currThreadStreamState?.isRunning !== 'idle' && (
                <div
                  className="flex items-center justify-center text-void-fg-3 text-sm"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '100%',
                    textAlign: 'center'
                  }}
                >
                  No assistant messages yet. Start sending a message by saying something with 'Cody Go' at the end.
                </div>
              )}
            </div>

            {/* Abort button - shows when LLM is running */}
            {(currThreadStreamState?.isRunning === 'LLM' || currThreadStreamState?.isRunning === 'idle' || streamingMessage) && (
              <button
                onClick={async () => {
                  const threadId = chatThreadsService.getCurrentThread().id;
                  await chatThreadsService.abortRunning(threadId);
                }}
                className="absolute bottom-4 left-4 p-2 rounded-full transition-all"
                style={{
                  background: 'var(--void-bg-3)',
                  border: '1px solid var(--void-border-2)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--void-bg-2)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--void-bg-3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                }}
                title="Stop generation"
              >
                <Square size={12} fill="currentColor" />
              </button>
            )}
            {/* Scroll to bottom button - hide when streaming/loading */}
            {isUserScrolling && currThreadStreamState?.isRunning !== 'LLM' && currThreadStreamState?.isRunning !== 'idle' && !streamingMessage && (
              <button
                onClick={() => scrollToBottom()}
                className="absolute bottom-4 right-4 p-2 rounded-full transition-all"
                style={{
                  background: 'var(--void-bg-3)',
                  border: '1px solid var(--void-border-2)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--void-bg-2)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--void-bg-3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                }}
                title="Scroll to bottom"
              >
                <ChevronDown size={16} />
              </button>
            )}
          </div>


          {/* Live transcript display - only show when connected and awake */}
          {isConnected && !isCodyAsleep && (
            <TranscriptDisplay
              transcript={currentTranscript}
              sendAppMessage={sendAppMessage}
              setCurrentTranscript={setCurrentTranscript}
              currentTranscriptRef={currentTranscriptRef}
            />
          )}
          {/* Staging selections - moved to bottom with horizontal scrolling */}
          {selections && selections.length > 0 && (
            <div className="border-t border-void-border-3 bg-void-bg-1">
              <div className="px-3 py-2">
                <div className="overflow-x-auto overflow-y-hidden" style={{ maxWidth: '100%' }}>
                  <VoiceChatSelectedFiles selections={selections} setSelections={setSelections} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};
