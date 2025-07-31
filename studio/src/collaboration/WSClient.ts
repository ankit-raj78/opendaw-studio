import { CollabMessage, CollabMessageType } from './MessageTypes'

export class WSClient {
  private ws: WebSocket | null = null
  private url: string
  private projectId: string
  private userId: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 2
  private reconnectDelay = 1000
  private messageHandlers: Map<CollabMessageType, (message: CollabMessage) => void> = new Map()
  private isConnecting = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  
  // Debouncing for SYNC_RESPONSE messages
  private syncResponseTimeout: NodeJS.Timeout | null = null
  private lastSyncResponseMessage: CollabMessage | null = null
  private readonly SYNC_RESPONSE_DEBOUNCE_MS = 500

  constructor(url: string, projectId: string, userId: string) {
    this.url = url
    this.projectId = projectId
    this.userId = userId
  }

  private getUserDisplayName(): string {
    // Generate a simple user number based on userId
    const shortId = this.userId.slice(0, 8)
    const userNumber = parseInt(shortId, 16) % 100 + 1 // Generate number 1-100
    return `User ${userNumber}`
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.isConnecting = true

    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to WebSocket: ${this.url}`)
        this.ws = new WebSocket(this.url)
        
        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnecting = false
          this.reconnectAttempts = 0
          
          // Start heartbeat
          this.startHeartbeat()
          
          // Join the project room with user information
          this.send({
            type: 'USER_JOIN',
            projectId: this.projectId,
            userId: this.userId,
            timestamp: Date.now(),
            data: {
              name: this.getUserDisplayName(),
              isActive: true
            }
          })
          
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: CollabMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason)
          this.isConnecting = false
          this.stopHeartbeat()
          
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.isConnecting = false
          reject(error)
        }

        // Connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false
            reject(new Error('WebSocket connection timeout'))
          }
        }, 5000)

      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  send(message: CollabMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        return true
      } catch (error) {
        console.error('Error sending WebSocket message:', error)
        return false
      }
    } else {
      console.warn('WebSocket not connected, message not sent:', message.type)
      return false
    }
  }

  onMessage(type: CollabMessageType, handler: (message: CollabMessage) => void): void {
    this.messageHandlers.set(type, handler)
  }

  removeMessageHandler(type: CollabMessageType): void {
    this.messageHandlers.delete(type)
  }

  private handleMessage(message: CollabMessage): void {
    console.log(`🔍 WSClient handleMessage: type=${message.type}, userId=${message.userId}, currentUser=${this.userId}`)
    
    // Don't process our own messages (except SYNC_RESPONSE)
    if (message.userId === this.userId && message.type !== 'SYNC_RESPONSE') {
      console.log(`⏭️ Skipping own message: ${message.type}`)
      return
    }

    // Handle heartbeat responses
    if (message.type === 'SYNC_RESPONSE') {
      // Debounce SYNC_RESPONSE messages to reduce excessive processing
      console.log(`🔄 Debouncing SYNC_RESPONSE (${this.SYNC_RESPONSE_DEBOUNCE_MS}ms)`)
      
      // Store the latest message
      this.lastSyncResponseMessage = message
      
      // Clear any existing timeout
      if (this.syncResponseTimeout) {
        clearTimeout(this.syncResponseTimeout)
      }
      
      // Set new timeout to process the latest message
      this.syncResponseTimeout = setTimeout(() => {
        if (this.lastSyncResponseMessage) {
          console.log(`🔄 Processing debounced SYNC_RESPONSE`)
          this.handleSyncResponse(this.lastSyncResponseMessage)
          this.lastSyncResponseMessage = null
        }
      }, this.SYNC_RESPONSE_DEBOUNCE_MS)
      
      return
    }

    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      try {
        console.log(`📨 Calling handler for ${message.type}`)
        handler(message)
      } catch (error) {
        console.error(`Error handling message type ${message.type}:`, error)
      }
    } else {
      console.log(`❌ No handler for message type: ${message.type}`)
    }
  }

  private handleSyncResponse(message: CollabMessage): void {
    // Emit sync response for any listeners
    const handler = this.messageHandlers.get('SYNC_RESPONSE')
    if (handler) {
      handler(message)
    }
  }

  private startHeartbeat(): void {
    // DISABLED: Frequent sync requests causing excessive audio loading
    // this.heartbeatInterval = setInterval(() => {
    //   if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    //     this.send({
    //       type: 'SYNC_REQUEST',
    //       projectId: this.projectId,
    //       userId: this.userId,
    //       timestamp: Date.now(),
    //       data: {}
    //     })
    //   }
    // }, 10000) // Send heartbeat every 10 seconds
    
    console.log('🔇 [WSClient] Heartbeat disabled to prevent excessive audio loading')
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts
    
    console.log(`Reconnecting... attempt ${this.reconnectAttempts} in ${delay}ms`)
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error)
      })
    }, delay)
  }

  disconnect(): void {
    this.stopHeartbeat()
    
    // Clean up sync response timeout
    if (this.syncResponseTimeout) {
      clearTimeout(this.syncResponseTimeout)
      this.syncResponseTimeout = null
      this.lastSyncResponseMessage = null
    }
    
    if (this.ws) {
      // Send leave message before disconnecting
      this.send({
        type: 'USER_LEAVE',
        projectId: this.projectId,
        userId: this.userId,
        timestamp: Date.now(),
        data: { reason: 'disconnect' }
      })
      
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  get connectionState(): string {
    if (!this.ws) return 'disconnected'
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting'
      case WebSocket.OPEN: return 'connected'
      case WebSocket.CLOSING: return 'closing'
      case WebSocket.CLOSED: return 'disconnected'
      default: return 'unknown'
    }
  }
}
