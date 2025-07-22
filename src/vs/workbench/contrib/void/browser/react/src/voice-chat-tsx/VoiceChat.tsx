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
import { Mic, MicOff, Phone, PhoneOff, Volume2, ChevronDown } from 'lucide-react';
import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useSettingsState } from '../util/services.js';
import { SelectedFiles, builtinToolNameToComponent, MCPToolWrapper, ToolRequestAcceptRejectButtons } from '../sidebar-tsx/SidebarChat.js';
import { ChatMarkdownRender, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
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

export const VoiceChat = (props: VoiceChatProps) => {
	const {
		roomUrl = 'https://victordev.daily.co/sample',
		token = '',
		userName = 'Cody'
	} = props
  const accessor = useAccessor();
  const chatThreadsService = accessor.get('IChatThreadService');
  const settingsState = useSettingsState();

  // Get current thread data
  const chatThreadsState = useChatThreadsState();
  const currentThread = chatThreadsService.getCurrentThread();
  const selections = currentThread.state.stagingSelections;
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

      // Only auto-scroll if user isn't manually scrolling
      if (!isUserScrolling) {
        scrollToBottom();
      }
    }
  }, [
    mostRecentAssistantMessage,
    streamingMessage,
    latestToolRequest,
    messages,
    scrollToBottom,
    isUserScrolling
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
              <span className="font-medium">Cody Voice</span>
            </div>

            {/* Connection status */}
            <span className="text-void-fg-3 flex-shrink-0">
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </span>

            {/* Participant count */}
            {isConnected && (
              <span className="text-void-fg-3 flex-shrink-0">
                {Object.keys(participants).length} participant{Object.keys(participants).length !== 1 ? 's' : ''}
              </span>
            )}

            {/* Messages indicator */}
            {messages.length > 0 && (
              <div className="flex items-center gap-1 text-void-fg-3 flex-shrink-0">
                <Volume2 size={12} />
                <span>{messages.length} messages</span>
              </div>
            )}
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

        {/* Staging selections */}
        {selections && selections.length > 0 && (
          <div className="px-3 py-2 border-b border-void-border-3 bg-void-bg-1">
            <div className="text-xs text-void-fg-3 mb-2">Current Selections:</div>
            <SelectedFiles
              type="past"
              selections={selections}
              messageIdx={-1}
            />
          </div>
        )}

        {/* Messages container - fills remaining space */}
        <div className="w-full h-full overflow-hidden relative">
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

            {/* Show streaming message if available */}
            {streamingMessage ? (
              renderMessageContent(streamingMessage, -1, true)
            ) : (
              /* Show most recent assistant message */
              mostRecentAssistantMessage && renderMessageContent(
                mostRecentAssistantMessage.message,
                mostRecentAssistantMessage.messageIdx,
                false
              )
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
            {!mostRecentAssistantMessage && !streamingMessage && (
              <div className="text-center text-void-fg-3 text-sm py-8">
                No assistant messages yet. Start a conversation in the main chat.
              </div>
            )}
          </div>

          {/* Scroll to bottom button */}
          {isUserScrolling && (
            <button
              onClick={() => scrollToBottom()}
              className="absolute bottom-2 right-2 p-2 bg-void-bg-3 hover:bg-void-bg-4 rounded-full shadow-lg border border-void-border-2 transition-all"
              title="Scroll to bottom"
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
