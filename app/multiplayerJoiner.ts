/**
 * Multiplayer Joiner Controller
 * 
 * The joiner is a "remote display" that:
 * - Receives complete game state from host
 * - Displays the state
 * - Sends player actions to host
 * - Does NOT compute any game logic
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { HostState, Seat, GameAction } from "./multiplayerHost";

export class MultiplayerJoiner {
  public channel: RealtimeChannel;
  private userId: string;
  private onStateUpdate: (state: HostState) => void;
  
  // Current state (received from host)
  private state: HostState | null = null;

  private opponentQuit: boolean = false;
  private onOpponentQuit?: () => void;
  
  constructor(
    channel: RealtimeChannel,
    userId: string,
    onStateUpdate: (state: HostState) => void,
    onOpponentQuit?: () => void
  ) {
    this.onOpponentQuit = onOpponentQuit;
    this.channel = channel;
    this.userId = userId;
    this.onStateUpdate = onStateUpdate;
    
    // Listen for state updates from host
    this.setupStateListener();
    
    // Request initial state from host
    this.requestState();
  }
  
  private setupStateListener() {
    this.channel.on("broadcast", { event: "mp" }, ({ payload }: any) => {
      if (!payload) return;
      
      // Ignore own messages
      if (payload.sender === this.userId) return;
      
      // Receive full state from host
      if (payload.event === "HOST_STATE" && payload.state) {
        this.state = payload.state as HostState;
        this.onStateUpdate(this.state);
      }
      
      // Handle opponent quit
      if (payload.event === "PLAYER_QUIT") {
        this.opponentQuit = true;
        if (this.onOpponentQuit) {
          this.onOpponentQuit();
        }
      }
    });
  }
  
  /**
   * Request the current game state from host
   */
  private requestState() {
    setTimeout(() => {
      this.channel.send({
        type: "broadcast",
        event: "mp",
        payload: {
          event: "SYNC",
          kind: "REQUEST_SNAPSHOT",
          sender: this.userId,
        },
      }).catch(() => {
        // Silently ignore request errors
      });
    }, 300);
  }
  
  /**
   * Send an action to the host
   */
  public sendAction(seat: Seat, action: GameAction) {
    this.channel.send({
      type: "broadcast",
      event: "mp",
      payload: {
        event: "ACTION",
        seat,
        action,
        sender: this.userId,
      },
    }).catch(() => {
      // Silently ignore send errors
    });
  }
  
  /**
   * Send show hand action to the host
   */
  public sendShowHand(seat: Seat) {
    this.channel.send({
      type: "broadcast",
      event: "mp",
      payload: {
        event: "SHOW_HAND",
        seat,
        sender: this.userId,
      },
    }).catch(() => {
      // Silently ignore send errors
    });
  }
  
  /**
   * Get current state
   */
  public getState(): HostState | null {
    return this.state;
  }
  
  /**
   * Clean up
   */
  public destroy() {
    // Broadcast quit message
    this.channel.send({
      type: "broadcast",
      event: "mp",
      payload: {
        event: "PLAYER_QUIT",
        sender: this.userId,
      },
    }).catch(() => {
      // Ignore errors on cleanup
    });
  }
}