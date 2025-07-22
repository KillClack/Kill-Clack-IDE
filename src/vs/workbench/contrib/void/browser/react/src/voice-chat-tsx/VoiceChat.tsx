/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import DailyIframe, {
  DailyCall,
  DailyEventObjectAppMessage,
} from '@daily-co/daily-js';
import { useIsDark } from '../util/services.js';
import { Mic, MicOff, Phone, PhoneOff, Volume2, ChevronDown, X } from 'lucide-react';
import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useSettingsState } from '../util/services.js';
import { builtinToolNameToComponent, MCPToolWrapper, ToolRequestAcceptRejectButtons, IconLoading, getRelative, getBasename } from '../sidebar-tsx/SidebarChat.js';
import { ChatMarkdownRender, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
import { StagingSelectionItem } from '../../../../common/chatThreadServiceTypes.js';
import { File, Folder, Text } from 'lucide-react';
import { ChatMessage, ToolMessage } from '../../../../common/chatThreadServiceTypes.js';
import { BuiltinToolName } from '../../../../common/toolsServiceTypes.js';
import { isABuiltinToolName} from '../../../../common/prompt/prompts.js';
import { displayInfoOfProviderName } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js';
import '../styles.css';

export type VoiceChatProps = {
	roomUrl?: string;
	token?: string;
	userName?: string;
}

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
              `}>
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

const TranscriptDisplay = ({ transcript }: { transcript: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(transcript);

  useEffect(() => {
    // Early return if no transcript
    if (!transcript) {
      setDisplayText('');
      return;
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
        const labelText = "Live Transcript: ";

        // Create a temporary span to measure text width
        const measureSpan = document.createElement('span');
        measureSpan.style.visibility = 'hidden';
        measureSpan.style.position = 'absolute';
        measureSpan.style.fontSize = '12px'; // Match the text-xs class
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

  if (!transcript) return null;

  return (
    <div className="border-t border-void-border-3 bg-void-bg-1">
      <div ref={containerRef} className="px-3 py-2 flex items-center gap-1 text-xs whitespace-nowrap overflow-hidden">
        <span className="text-void-fg-3 flex-shrink-0">Live Transcript:</span>
        <span className="text-void-fg-2 overflow-hidden">
          {displayText}
        </span>
      </div>
    </div>
  );
};

export const VoiceChat = (props: VoiceChatProps) => {
	const {
		roomUrl = 'https://victordev.daily.co/sample',
		token = '',
		userName = 'Cody'
	} = props
  const accessor = useAccessor();
  const chatThreadsService = accessor.get('IChatThreadService');
  const settingsState = useSettingsState();
  const [currentTranscript, setCurrentTranscript] = useState('');

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
  const [messages, setMessages] = useState<Array<{from: string, text: string, timestamp: Date}>>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // Refs
  const callObjectRef = useRef<DailyCall | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollHeight = useRef<number>(0);

  const keepAliveRef = useRef<{ status: string; lastTime: number }>({
    status: 'OK',
    lastTime: 0,
  });

  // Current settings display (read-only)
  const currentChatMode = settingsState.globalSettings.chatMode;
  const currentModelSelection = settingsState.modelSelectionOfFeature.Chat;

  const chatModeDisplay = {
    'normal': 'Chat',
    'gather': 'Gather',
    'agent': 'Agent',
  }[currentChatMode];

  const modelDisplay = currentModelSelection
    ? `${currentModelSelection.modelName} (${displayInfoOfProviderName(currentModelSelection.providerName).title})`
    : 'No model selected';

  // Get the most recent assistant message
  const mostRecentAssistantMessage = useMemo(() => {
    const assistantMessages = currentThread.messages.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length === 0) return null;

    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const messageIdx = currentThread.messages.findLastIndex(msg => msg.role === 'assistant');

    return { message: lastMessage, messageIdx };
  }, [currentThread.messages]);

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

  // Get the latest tool request that needs approval
  const latestToolRequest = useMemo(() => {
    const toolMessages = currentThread.messages.filter(msg =>
      msg.role === 'tool' && msg.type === 'tool_request'
    );
    return toolMessages.length > 0 ? {
      message: toolMessages[toolMessages.length - 1] as ToolMessage<any>,
      messageIdx: currentThread.messages.findLastIndex(msg => msg.role === 'tool' && msg.type === 'tool_request')
    } : null;
  }, [currentThread.messages]);

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

  // Initialize Daily call
  const initializeCall = useCallback(async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);

    try {
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
      await newCallObject.join({
        url: roomUrl,
        token: token,
        userName: userName,
        videoSource: false,
      });

    } catch (error) {
      console.error('Failed to initialize call:', error);
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, roomUrl, token, userName]);

  // Handle app messages
  const handleAppMessage = useCallback((event: DailyEventObjectAppMessage) => {
    if (event.fromId === 'local') return;

    const messageType = event.data?.type;
    const content = event.data?.content;

    // Add to messages list
    if (messageType === 'chat_message' || messageType === 'agent_response') {
      setMessages(prev => [...prev, {
        from: event.data?.user_name || 'Unknown',
        text: content,
        timestamp: new Date()
      }]);
    }

    // Handle transcript updates
    if (messageType === 'latest_transcript') {
      setCurrentTranscript(content || '');
    }

    // Handle turn completed - reset transcript
    if (messageType === 'turn_completed') {
      setCurrentTranscript('');
    }

    // Handle keepalive
    if (messageType === 'keepalive') {
      keepAliveRef.current = {
        status: 'OK',
        lastTime: Date.now(),
      };
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!callObject) return;

    // Connection events
    callObject.on('joined-meeting', () => {
      setIsConnected(true);
      setIsConnecting(false);
      console.log('Joined meeting successfully');
    });

    callObject.on('left-meeting', () => {
      setIsConnected(false);
      console.log('Left meeting');
    });

    // Message events
    callObject.on('app-message', handleAppMessage);

    // Network events
    callObject.on('network-connection', (event: any) => {
      if (event?.type === 'signaling') {
        if (event?.event === 'connected') {
          console.log('Network connection re-established');
        } else if (event?.event === 'interrupted') {
          console.log('Network connection lost');
        }
      }
    });

    // Cleanup
    return () => {
      callObject.off('app-message', handleAppMessage);
    };
  }, [callObject, handleAppMessage]);

  // Keepalive interval
  useEffect(() => {
    if (!isConnected || !callObject) return;

    const intervalId = setInterval(() => {
      // Check keepalive status
      if (Date.now() - keepAliveRef.current.lastTime > 15000 && keepAliveRef.current.lastTime !== 0) {
        console.warn('Keepalive timeout detected');
      }

      // Send keepalive
      try {
        callObject.sendAppMessage({
          type: 'keepalive',
          content: Date.now().toString(),
          user_name: userName,
        }, '*');
      } catch (error) {
        console.error('Error sending keepalive:', error);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isConnected, callObject, userName]);

  // Detect content changes and scroll to bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Check if content height changed
    if (container.scrollHeight !== lastScrollHeight.current) {
      lastScrollHeight.current = container.scrollHeight;

      // Always auto-scroll if streaming or loading
      const isStreamingOrLoading = streamingMessage || currThreadStreamState?.isRunning === 'LLM' || currThreadStreamState?.isRunning === 'idle';

      // Auto-scroll if user isn't manually scrolling OR if streaming/loading
      if (!isUserScrolling || isStreamingOrLoading) {
        scrollToBottom();
      }
    }
  }, [
    mostRecentAssistantMessage,
    streamingMessage,
    latestToolRequest,
    messages,
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
      setMessages([]);
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }, [callObject]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.leave().catch(console.error);
        callObjectRef.current.destroy().catch(console.error);
      }
    };
  }, []);

  // Render the message content with proper styling
  const renderMessageContent = (messageToRender: ChatMessage & { role: 'assistant' }, messageIdx: number, isStreaming: boolean = false) => {
    const chatMessageLocation: ChatMessageLocation = {
      threadId: currentThread.id,
      messageIdx: messageIdx,
    };

    return (
      <div className={`voice-chat-message ${isStreaming ? 'streaming' : ''}`}>
        {/* Reasoning */}
        {messageToRender.reasoning && (
          <div className="voice-chat-reasoning">
            <div className="text-void-fg-3 text-xs mb-2">Reasoning:</div>
            <div className="text-void-fg-4 text-sm prose prose-sm break-words max-w-none">
              <ChatMarkdownRender
                string={messageToRender.reasoning}
                chatMessageLocation={chatMessageLocation}
                isApplyEnabled={false}
                isLinkDetectionEnabled={true}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        {messageToRender.displayContent && (
          <div className="voice-chat-content">
            <div className="text-void-fg-2 prose prose-sm break-words max-w-none">
              <ChatMarkdownRender
                string={messageToRender.displayContent}
                chatMessageLocation={chatMessageLocation}
                isApplyEnabled={true}
                isLinkDetectionEnabled={true}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render tool request with full details (same logic as SidebarChat)
  const renderToolRequest = (toolMessage: ToolMessage<any>, messageIdx: number) => {
    const toolName = toolMessage.name;
    const isBuiltInTool = isABuiltinToolName(toolName);
    const ToolResultWrapper = isBuiltInTool
      ? builtinToolNameToComponent[toolName as BuiltinToolName]?.resultWrapper as any
      : MCPToolWrapper as any;

    if (!ToolResultWrapper) return null;

    return (
      <div className="space-y-2">
        {/* Show the tool request details using the same wrapper as SidebarChat */}
        <ToolResultWrapper
          toolMessage={toolMessage}
          messageIdx={messageIdx}
          threadId={currentThread.id}
        />

        {/* Show the accept/reject buttons */}
        <div className="flex justify-center">
          <ToolRequestAcceptRejectButtons toolName={toolName} />
        </div>
      </div>
    );
  };

  const isDark = useIsDark()

  const [isDemoMode, setIsDemoMode] = useState(true);
  useEffect(() => {
    if (!isDemoMode) return;

    const demoTranscripts = [
      "Hello",
      "Hello, I'm",
      "Hello, I'm wondering",
      "Hello, I'm wondering if",
      "Hello, I'm wondering if you",
      "Hello, I'm wondering if you could",
      "Hello, I'm wondering if you could help",
      "Hello, I'm wondering if you could help me",
      "Hello, I'm wondering if you could help me understand",
      "Hello, I'm wondering if you could help me understand how",
      "Hello, I'm wondering if you could help me understand how to",
      "Hello, I'm wondering if you could help me understand how to implement",
      "Hello, I'm wondering if you could help me understand how to implement a",
      "Hello, I'm wondering if you could help me understand how to implement a binary",
      "Hello, I'm wondering if you could help me understand how to implement a binary search",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling f",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling for",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling for edge cases",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling for edge cases and performance",
      "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling for edge cases and performance optimizations",
        "Hello, I'm wondering if you could help me understand how to implement a binary search tree in TypeScript with proper type safety and error handling for edge cases and performance optimizations in a way that is easy to follow"
      ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < demoTranscripts.length) {
        setCurrentTranscript(demoTranscripts[currentIndex]);
        currentIndex++;
      } else {
        // Simulate turn completed
        setCurrentTranscript('');

        // Start a new sentence after a pause
        setTimeout(() => {
          if (isDemoMode) {
            const secondDemo = [
              "Also",
              "Also, could",
              "Also, could you",
              "Also, could you show",
              "Also, could you show me",
              "Also, could you show me some",
              "Also, could you show me some examples",
              "Also, could you show me some examples of",
              "Also, could you show me some examples of how",
              "Also, could you show me some examples of how to",
              "Also, could you show me some examples of how to traverse",
              "Also, could you show me some examples of how to traverse the",
              "Also, could you show me some examples of how to traverse the tree",
            ];

            let secondIndex = 0;
            const secondInterval = setInterval(() => {
              if (secondIndex < secondDemo.length && isDemoMode) {
                setCurrentTranscript(secondDemo[secondIndex]);
                secondIndex++;
              } else {
                setCurrentTranscript('');
                clearInterval(secondInterval);
              }
            }, 1000);
          }
        }, 1000);

        clearInterval(interval);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      setCurrentTranscript('');
    };
  }, [isDemoMode]);

  return (
    <div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
      <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1 bg-void-bg-2 text-void-fg-1 text-xs border-b border-void-border-3">
          {/* Left side - Status and connection info */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Status indicator */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' :
                isConnecting ? 'bg-yellow-500 animate-pulse' :
                'bg-gray-500'
              }`} />
              <span className="font-medium">Cody</span>
            </div>

            {/* Connection status */}
            <span className="text-void-fg-3 flex-shrink-0">
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>

          {/* Center - Current settings display (read-only) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-2 rounded py-0.5 px-1">
              {chatModeDisplay}
            </div>
            <div className="text-xs text-void-fg-3 bg-void-bg-1 rounded py-0.5 px-1" title={modelDisplay}>
              {currentModelSelection ?
                `${currentModelSelection.modelName.length > 12 ?
                  currentModelSelection.modelName.substring(0, 12) + '...' :
                  currentModelSelection.modelName}`
                : 'No model'}
            </div>
          </div>

          {/* Right side - Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isConnected && (
              <button
                onClick={toggleMute}
                className="p-1 rounded hover:bg-void-bg-3 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            )}

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
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="w-full h-full p-3 space-y-4 overflow-y-auto"
            style={{
              scrollbarWidth: 'none', // Firefox
              msOverflowStyle: 'none', // IE/Edge
            }}
          >
            {/* Hide webkit scrollbars */}
            <style>{`
              .overflow-y-auto::-webkit-scrollbar {
                display: none;
              }
            `}</style>

            {/* Show most recent assistant message (always visible, even when loading) */}
            {mostRecentAssistantMessage && !streamingMessage && renderMessageContent(
              mostRecentAssistantMessage.message,
              mostRecentAssistantMessage.messageIdx,
              false
            )}

            {/* Show streaming message if available */}
            {streamingMessage && renderMessageContent(streamingMessage, -1, true)}

            {/* Loading indicator - shows below the last message */}
            {(currThreadStreamState?.isRunning === 'LLM' || currThreadStreamState?.isRunning === 'idle') && !streamingMessage && (
              <div className="text-void-fg-2 prose prose-sm">
                <IconLoading className='opacity-50 text-sm' />
              </div>
            )}

            {/* Tool request approval with full details */}
            {latestToolRequest && (
              <div className="mt-4 p-3 bg-void-bg-3 rounded border border-void-border-2">
                <div className="text-sm text-void-fg-2 mb-3 font-medium">
                  Tool approval required:
                </div>
                {renderToolRequest(latestToolRequest.message, latestToolRequest.messageIdx)}
              </div>
            )}

            {/* Show message if no assistant messages */}
            {!mostRecentAssistantMessage && !streamingMessage && currThreadStreamState?.isRunning !== 'LLM' && currThreadStreamState?.isRunning !== 'idle' && (
              <div className="text-center text-void-fg-3 text-sm py-8">
                No assistant messages yet. Start a conversation in the main chat.
              </div>
            )}
          </div>

          {/* Scroll to bottom button - hide when streaming/loading */}
          {isUserScrolling && currThreadStreamState?.isRunning !== 'LLM' && currThreadStreamState?.isRunning !== 'idle' && !streamingMessage && (
            <button
              onClick={() => scrollToBottom()}
              className="absolute bottom-2 right-2 p-2 bg-void-bg-3 hover:bg-void-bg-4 rounded-full shadow-lg border border-void-border-2 transition-all"
              title="Scroll to bottom"
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>
        {/* Live transcript display */}
        <TranscriptDisplay transcript={currentTranscript} />
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
  );
};
