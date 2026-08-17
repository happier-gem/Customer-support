"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./api";

export type TicketSocketEvent = "ticket:created" | "ticket:updated" | "ticket:attachment-added";

export interface TicketSocketPayload {
  ticket?: { id: string };
  ticketId?: string;
}

/**
 * Connects to the gateway's ticket WebSocket namespace, authenticated via
 * the same in-memory access token used for REST calls (sent in the Socket.IO
 * handshake `auth` payload, never a URL query string). Reconnection is
 * handled automatically by socket.io-client; while disconnected, callers
 * simply stop receiving live events — their existing on-mount fetch already
 * covers the non-live baseline, so there's nothing else to fall back to.
 */
export function useTicketSocket(
  accessToken: string | null,
  onEvent: (event: TicketSocketEvent, payload: TicketSocketPayload) => void,
) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      return;
    }

    const socket: Socket = io(`${API_BASE}/ws/tickets`, {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    const events: TicketSocketEvent[] = ["ticket:created", "ticket:updated", "ticket:attachment-added"];
    for (const event of events) {
      socket.on(event, (payload: TicketSocketPayload) => onEventRef.current(event, payload));
    }

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  return { connected };
}
