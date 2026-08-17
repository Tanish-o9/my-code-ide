import { Socket } from 'socket.io';

export interface PresentUser {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  connectedAt: Date;
}

// Map: workspaceId -> Map: userId -> details
const workspacePresences = new Map<string, Map<string, PresentUser>>();

// Map: socketId -> Set of { workspaceId, userId } to cleanup on disconnect
const socketRooms = new Map<string, Set<{ workspaceId: string; userId: string }>>();

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

export class PresenceService {
  /**
   * Registers a user's presence inside a workspace room.
   */
  public static joinWorkspace(
    socket: Socket,
    workspaceId: string,
    user: { userId: string; name: string; email: string; avatar?: string }
  ): void {
    const socketId = socket.id;

    // 1. Get or create workspace presence registry
    let presenceMap = workspacePresences.get(workspaceId);
    if (!presenceMap) {
      presenceMap = new Map<string, PresentUser>();
      workspacePresences.set(workspaceId, presenceMap);
    }

    // 2. Assign color index deterministically or based on active size
    const color = PALETTE[presenceMap.size % PALETTE.length];

    // 3. Add or update user details
    const presentUser: PresentUser = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      avatar: user.avatar || '',
      color,
      connectedAt: new Date(),
    };
    presenceMap.set(user.userId, presentUser);

    // 4. Map socket to room for cleanup
    let rooms = socketRooms.get(socketId);
    if (!rooms) {
      rooms = new Set();
      socketRooms.set(socketId, rooms);
    }
    rooms.add({ workspaceId, userId: user.userId });

    // 5. Join Socket.IO room and broadcast updated presence list
    socket.join(`presence:${workspaceId}`);
    
    const io = socket.nsp; // Use current namespaced connection
    io.to(`presence:${workspaceId}`).emit('presence:update', {
      workspaceId,
      users: Array.from(presenceMap.values()),
    });

    console.log(`[Presence] User ${user.name} (${user.userId}) joined workspace ${workspaceId}`);
  }

  /**
   * Removes socket from registered rooms on disconnect.
   */
  public static leaveAll(socket: Socket): void {
    const socketId = socket.id;
    const rooms = socketRooms.get(socketId);
    if (!rooms) return;

    for (const { workspaceId, userId } of rooms) {
      const presenceMap = workspacePresences.get(workspaceId);
      if (presenceMap) {
        // Remove from presence
        presenceMap.delete(userId);
        
        // If workspace is now empty, delete registry
        if (presenceMap.size === 0) {
          workspacePresences.delete(workspaceId);
        } else {
          // Broadcast updated list
          socket.nsp.to(`presence:${workspaceId}`).emit('presence:update', {
            workspaceId,
            users: Array.from(presenceMap.values()),
          });
        }
      }
    }

    socketRooms.delete(socketId);
  }

  /**
   * Retrieves active users in a workspace.
   */
  public static getPresentUsers(workspaceId: string): PresentUser[] {
    const presenceMap = workspacePresences.get(workspaceId);
    return presenceMap ? Array.from(presenceMap.values()) : [];
  }
}
