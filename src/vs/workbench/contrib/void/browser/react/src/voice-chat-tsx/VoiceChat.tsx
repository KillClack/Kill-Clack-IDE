/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef, useState, useCallback } from 'react';

import DailyIframe, {
  DailyCall,
  DailyEventObjectAppMessage,
} from '@daily-co/daily-js';

import { Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { useAccessor } from '../util/services.js';
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

  // State
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<Record<string, any>>({});
  const [messages, setMessages] = useState<Array<{from: string, text: string, timestamp: Date}>>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  // Refs
  const callObjectRef = useRef<DailyCall | null>(null);
  const keepAliveRef = useRef<{ status: string; lastTime: number }>({
    status: 'OK',
    lastTime: 0,
  });

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
  }, [isConnecting, isConnected]);


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
  }, [isConnected, callObject]);


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

  return (
    <div className="@@void-scope">
      <div className="flex items-center gap-2 px-3 py-1 bg-void-bg-2 text-void-fg-1 text-xs border-t border-void-border-3">
        {/* Status indicator */}
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' :
            isConnecting ? 'bg-yellow-500 animate-pulse' :
            'bg-gray-500'
          }`} />
          <span className="font-medium">Cody Voice</span>
        </div>

        {/* Connection status */}
        <span className="text-void-fg-3">
          {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
        </span>

        {/* Participant count */}
        {isConnected && (
          <span className="text-void-fg-3">
            {Object.keys(participants).length} participant{Object.keys(participants).length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Messages indicator */}
        {messages.length > 0 && (
          <div className="flex items-center gap-1 text-void-fg-3">
            <Volume2 size={12} />
            <span>{messages.length} messages</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-1">
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
    </div>
  );
};
