import { CollabMessage } from './MessageTypes'

interface UserInfo {
  id: string
  name: string
  color: string
  isActive: boolean
}

export class OverlayManager {
  private currentUserId: string
  private projectId: string
  private users: Map<string, UserInfo> = new Map()
  private boxOwnership: Map<string, string> = new Map() // boxUuid -> userId
  private observer: MutationObserver | null = null
  private isInitialized = false
  private collaborationPanel: HTMLElement | null = null
  private connectionStatus: HTMLElement | null = null

  constructor(projectId: string, userId: string) {
    this.projectId = projectId
    this.currentUserId = userId
    this.setupMutationObserver()
    this.injectStyles()
    this.createUI()
  }

  private injectStyles(): void {
    // Check if styles are already injected
    if (document.getElementById('opendaw-collab-styles')) {
      return
    }

    const link = document.createElement('link')
    link.id = 'opendaw-collab-styles'
    link.rel = 'stylesheet'
    link.href = '/opendaw-collab-styles.css' // We'll serve this from our server
    document.head.appendChild(link)

    // Fallback: inject critical styles inline
    const style = document.createElement('style')
    style.id = 'opendaw-collab-styles-inline'
    style.textContent = `
      .box-owned-by-me { border-left: 4px solid #10b981 !important; }
      .box-owned-by-others { border-left: 4px solid var(--owner-color, #ef4444) !important; opacity: 0.8; }
      .box-locked { pointer-events: none !important; filter: grayscale(0.5); opacity: 0.6; }
      .box-owned-by-others input, .box-owned-by-others button { pointer-events: none !important; opacity: 0.6; }
    `
    document.head.appendChild(style)
  }

  private createUI(): void {
    this.createCollaborationPanel()
    this.createConnectionStatus()
  }

  private createCollaborationPanel(): void {
    this.collaborationPanel = document.createElement('div')
    this.collaborationPanel.className = 'collaboration-panel'
    this.collaborationPanel.innerHTML = `
      <h3>Collaborators</h3>
      <ul class="user-list" id="user-list"></ul>
    `
    document.body.appendChild(this.collaborationPanel)
  }

  private createConnectionStatus(): void {
    this.connectionStatus = document.createElement('div')
    this.connectionStatus.className = 'connection-status disconnected'
    this.connectionStatus.textContent = 'Disconnected'
    document.body.appendChild(this.connectionStatus)
  }

  private setupMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element
            this.scanForBoxElements(element)
          }
        })
      })
    })

    // Start observing when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.startObserving()
      })
    } else {
      this.startObserving()
    }
  }

  private startObserving(): void {
    if (!this.observer) return
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    })

    // Scan existing elements
    this.scanForBoxElements(document.body)
  }

  private scanForBoxElements(root: Element): void {
    // Look for potential box elements with various selectors
    const selectors = [
      '[data-box-uuid]',           // If OpenDAW uses data attributes
      '.audio-unit-box',           // Common class name
      '.box',                      // Generic box class
      '[class*="box"]',            // Any class containing "box"
      '[id*="box"]',               // Any ID containing "box"
      '.track',                    // Alternative naming
      '[data-track-id]'            // Track data attributes
    ]

    selectors.forEach(selector => {
      try {
        const elements = root.querySelectorAll(selector)
        elements.forEach(element => {
          this.applyOwnershipStyling(element as HTMLElement)
        })
      } catch (error) {
        // Ignore invalid selectors
      }
    })
  }

  private applyOwnershipStyling(element: HTMLElement): void {
    const boxUuid = this.extractBoxUuid(element)
    if (!boxUuid) return

    const owner = this.boxOwnership.get(boxUuid)
    
    // Remove existing ownership classes
    element.classList.remove('box-owned-by-me', 'box-owned-by-others', 'box-locked')
    element.style.removeProperty('--owner-color')

    if (!owner) {
      // No owner - neutral state
      return
    }

    if (owner === this.currentUserId) {
      element.classList.add('box-owned-by-me')
    } else {
      element.classList.add('box-owned-by-others')
      const userInfo = this.users.get(owner)
      if (userInfo) {
        element.style.setProperty('--owner-color', userInfo.color)
      }
    }
  }

  private extractBoxUuid(element: HTMLElement): string | null {
    // Try various methods to extract box UUID
    
    // 1. Data attributes
    const dataUuid = element.dataset.boxUuid || element.dataset.trackId || element.dataset.uuid
    if (dataUuid) return dataUuid

    // 2. ID attribute
    const id = element.id
    if (id) {
      // Try to extract UUID from ID
      const uuidMatch = id.match(/([a-f0-9-]{36})/i)
      if (uuidMatch) return uuidMatch[1]
    }

    // 3. Class names
    const className = element.className
    if (className) {
      const uuidMatch = className.match(/([a-f0-9-]{36})/i)
      if (uuidMatch) return uuidMatch[1]
    }

    // 4. Look for UUID in child elements
    const uuidElements = element.querySelectorAll('[data-uuid], [data-box-uuid], [data-track-id]')
    if (uuidElements.length > 0) {
      const firstUuidElement = uuidElements[0] as HTMLElement
      return firstUuidElement.dataset.uuid || firstUuidElement.dataset.boxUuid || firstUuidElement.dataset.trackId || null
    }

    return null
  }

  // Public methods for handling collaboration messages

  updateConnectionStatus(status: 'connected' | 'connecting' | 'disconnected'): void {
    if (this.connectionStatus) {
      this.connectionStatus.className = `connection-status ${status}`
      this.connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1)
    }
  }

  addUser(userId: string, userInfo: Partial<UserInfo>): void {
    const user: UserInfo = {
      id: userId,
      name: userInfo.name || `User ${userId.slice(0, 8)}`,
      color: userInfo.color || this.generateUserColor(userId),
      isActive: true
    }
    
    this.users.set(userId, user)
    this.updateUserList()
  }

  removeUser(userId: string): void {
    this.users.delete(userId)
    this.updateUserList()
    
    // Remove ownership styling for this user
    this.removeUserBoxStyling(userId)
  }

  updateBoxOwnership(boxUuid: string, ownerId: string): void {
    this.boxOwnership.set(boxUuid, ownerId)
    this.refreshAllBoxStyling()
    this.showNotification(`Box owned by ${this.getUserName(ownerId)}`)
  }

  removeBoxOwnership(boxUuid: string): void {
    this.boxOwnership.delete(boxUuid)
    this.refreshAllBoxStyling()
  }

  handleCollaborationMessage(message: CollabMessage): void {
    switch (message.type) {
      case 'USER_JOIN':
        this.addUser(message.userId, message.data)
        this.showNotification(`${this.getUserName(message.userId)} joined`)
        break
      
      case 'USER_LEAVE':
        this.showNotification(`${this.getUserName(message.userId)} left`)
        this.removeUser(message.userId)
        break
      
      case 'BOX_OWNERSHIP_CLAIMED':
        this.updateBoxOwnership(message.data.boxUuid, message.data.ownerId)
        break
      
      case 'BOX_CREATED':
        this.updateBoxOwnership(message.data.boxUuid, message.data.ownerId)
        this.showNotification(`${this.getUserName(message.userId)} created a new track`)
        break
      
      case 'BOX_UPDATED':
        this.showNotification(`${this.getUserName(message.userId)} updated a track`, 1000)
        break
      
      case 'SYNC_RESPONSE':
        this.syncState(message.data)
        break
    }
  }

  private syncState(data: any): void {
    // Update ownership from server state
    this.boxOwnership.clear()
    Object.entries(data.ownership).forEach(([boxUuid, ownerId]) => {
      this.boxOwnership.set(boxUuid, ownerId as string)
    })

    // Update active users
    data.activeUsers.forEach((userId: string) => {
      if (!this.users.has(userId) && userId !== this.currentUserId) {
        this.addUser(userId, {})
      }
    })

    this.refreshAllBoxStyling()
  }

  private updateUserList(): void {
    const userList = document.getElementById('user-list')
    if (!userList) return

    userList.innerHTML = ''
    
    this.users.forEach(user => {
      const li = document.createElement('li')
      li.className = 'user-item'
      li.innerHTML = `
        <div class="user-avatar" style="background-color: ${user.color}">
          ${user.name.charAt(0).toUpperCase()}
        </div>
        <span class="user-name">${user.name}</span>
        <span class="user-status">${user.isActive ? 'active' : 'away'}</span>
      `
      userList.appendChild(li)
    })
  }

  private refreshAllBoxStyling(): void {
    // Re-scan and apply styling to all box elements
    this.scanForBoxElements(document.body)
  }

  private removeUserBoxStyling(userId: string): void {
    // Remove styling for boxes owned by this user
    Array.from(this.boxOwnership.entries())
      .filter(([, ownerId]) => ownerId === userId)
      .forEach(([boxUuid]) => {
        this.boxOwnership.delete(boxUuid)
      })
    
    this.refreshAllBoxStyling()
  }

  private generateUserColor(userId: string): string {
    // Generate consistent color based on user ID
    const colors = [
      '#ef4444', '#f59e0b', '#10b981', '#3b82f6', 
      '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ]
    
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff
    }
    
    return colors[Math.abs(hash) % colors.length]
  }

  private getUserName(userId: string): string {
    const user = this.users.get(userId)
    return user ? user.name : `User ${userId.slice(0, 8)}`
  }

  private showNotification(message: string, duration: number = 3000): void {
    const notification = document.createElement('div')
    notification.className = 'collab-notification'
    notification.textContent = message
    document.body.appendChild(notification)

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, duration)
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect()
    }
    
    if (this.collaborationPanel) {
      this.collaborationPanel.remove()
    }
    
    if (this.connectionStatus) {
      this.connectionStatus.remove()
    }
    
    // Remove injected styles
    const styles = document.getElementById('opendaw-collab-styles')
    if (styles) styles.remove()
    
    const inlineStyles = document.getElementById('opendaw-collab-styles-inline')
    if (inlineStyles) inlineStyles.remove()
  }
}
