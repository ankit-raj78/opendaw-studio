import { Update, BoxGraph, Box, NewUpdate, PrimitiveUpdate, PointerUpdate, DeleteUpdate, Address, ValueSerialization, PrimitiveType } from 'box'
import { ByteArrayOutput, ByteArrayInput, UUID, Option, Subscription } from 'std'
import { WSClient } from '../../../../opendaw-collab-mvp/src/websocket/WSClient'
import { StudioService } from '../../service/StudioService'
import { AudioSyncManager } from './AudioSyncManager'
// @ts-ignore
import { createCollabMessage } from '../../../../opendaw-collab-mvp/src/websocket/MessageTypes'

// Access getAuthToken from window
declare const window: any

export interface UpdateListener {
  onUpdate(update: Update): void
}

export class UpdateBasedTimelineSync {
  private updateQueue: Update[] = []
  private batchTimer: number | null = null
  private subscription: Subscription | null = null
  private audioSyncManager?: AudioSyncManager
  private isApplyingRemote = false
  private hasInitialContentSaved = false
  private sendTimeout: number | null = null
  private lastSaveTime = 0
  private saveDebounceTime = 2000 // 2秒防抖
  
  constructor(
    private service: StudioService,
    private wsClient: WSClient
  ) {}
  
  setAudioSyncManager(manager: AudioSyncManager) {
    this.audioSyncManager = manager
  }
  
  // 实现 UpdateListener 接口
  onUpdate(update: Update): void {
    if (!this.isApplyingRemote) {
      console.log(`[UpdateSync] Local update detected: ${update.type} ${update.constructor.name}`)
      
      // 对于重要的更新（新建、删除），立即保存到数据库
      if (update.type === 'new' || update.type === 'delete') {
        this.scheduleSaveToDatabase()
      }
    }
  }
  
  // 调度保存到数据库（带防抖）
  private scheduleSaveToDatabase() {
    const now = Date.now()
    if (now - this.lastSaveTime < this.saveDebounceTime) {
      console.log('[UpdateSync] Save debounced, waiting...')
      return
    }
    
    this.lastSaveTime = now
    console.log('[UpdateSync] Scheduling save to database...')
    
    setTimeout(async () => {
      await this.saveBoxGraphToServer()
      
      // 通知其他客户端重新加载
      const message = (createCollabMessage as any).projectUpdated?.(
        this.wsClient.projectId,
        this.wsClient.userId,
        { message: 'Project updated, please reload' }
      ) || {
        type: 'PROJECT_UPDATED',
        projectId: this.wsClient.projectId,
        userId: this.wsClient.userId,
        timestamp: Date.now(),
        data: {
          message: 'Project updated, please reload'
        }
      }
      
      this.wsClient.send(message)
    }, 500)
  }
  
  // 保存当前BoxGraph到服务器
  private async saveBoxGraphToServer() {
    console.log('[UpdateSync] 🚀 saveBoxGraphToServer called')
    
    try {
      // Use the unified auth token function
      const getAuthToken = window.getAuthToken
      if (!getAuthToken) {
        console.error('[UpdateSync] getAuthToken function not available')
        return
      }
      
      const { token, source: tokenSource } = getAuthToken()
      console.log('[UpdateSync] Token from:', tokenSource, 'Present:', !!token)
      
      if (!token) {
        console.error('[UpdateSync] No authentication token found!')
        return
      }
      
      // Import Projects module to use exportBundle
      const { Projects } = await import('@/project/Projects')
      
      // Get current session
      const sessionOption = this.service.sessionService.getValue()
      if (sessionOption.isEmpty()) {
        console.error('[UpdateSync] No active session to save')
        return
      }
      
      const session = sessionOption.unwrap()
      
      // Export the project as .odb bundle
      const bundleBuffer = await Projects.exportBundle(session, { setValue: () => {} } as any)
      const bundleData = Array.from(new Uint8Array(bundleBuffer))
      const boxCount = Array.from(this.service.project.boxGraph.boxes()).length
      
      console.log(`[UpdateSync] 📦 Project bundle prepared: ${bundleData.length} bytes, ${boxCount} boxes`)
      console.log(`[UpdateSync] Project ID (roomId): ${this.wsClient.projectId}`)
      
      // Get the correct API base URL (Next.js server on port 8000)
      const apiBaseUrl = 'http://localhost:8000'
      const url = `${apiBaseUrl}/api/rooms/${this.wsClient.projectId}/studio-project`
      console.log(`[UpdateSync] 📤 Sending PUT request to: ${url}`)
      
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ boxGraphData: bundleData })
      })
      
      console.log(`[UpdateSync] Response status: ${response.status}`)
      
      if (response.ok) {
        // Check content type before parsing
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json()
          console.log('[UpdateSync] ✅ Project bundle saved to server successfully')
          console.log('[UpdateSync] Server response:', result)
        } else {
          // Response is not JSON - likely HTML
          const responseText = await response.text()
          console.error('[UpdateSync] ❌ Expected JSON response but got:', contentType)
          console.error('[UpdateSync] ❌ Response preview:', responseText.substring(0, 200) + '...')
          console.error('[UpdateSync] ❌ This usually means the API endpoint is not configured correctly')
        }
      } else {
        const errorText = await response.text()
        console.error('[UpdateSync] ❌ Failed to save project bundle:', response.status, errorText)
      }
    } catch (error) {
      console.error('[UpdateSync] ❌ Error saving project bundle:', error)
      console.error('[UpdateSync] Error details:', error)
    }
  }
  
  // 获取可用的API URL
  private async getWorkingApiBaseUrl(token: string): Promise<string | null> {
    const apiUrls = [
      'http://localhost:8000',  // 正确的端口
      'http://localhost:3000',  // 备用
      'http://localhost:3001',  // 备用
      'http://localhost:3002'   // 备用
    ]
    
    for (const url of apiUrls) {
      try {
        const response = await fetch(`${url}/api/health`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
        if (response.ok) {
          return url
        }
      } catch (e) {
        // Continue to next URL
      }
    }
    
    return null
  }
  
  // 开始监听
  async start() {
    console.log('[UpdateSync] Starting timeline synchronization (simplified mode)...')
    
    // 在开始监听之前，检查是否已经有内容
    const initialBoxCount = Array.from(this.service.project.boxGraph.boxes()).length
    console.log(`[UpdateSync] Initial box count: ${initialBoxCount}`)
    
    // 如果已经有内容（超过基础的6个Box），立即保存
    if (initialBoxCount > 6 && !this.hasInitialContentSaved) {
      this.hasInitialContentSaved = true
      console.log('[UpdateSync] Existing content detected, saving BoxGraph to server...')
      setTimeout(() => this.saveBoxGraphToServer(), 100)
    }
    
    // 监听本地更新
    this.subscription = this.service.project.boxGraph.subscribeToAllUpdates(this)
    
    // 监听项目更新通知（简化方案）
    this.wsClient.onMessage('PROJECT_UPDATED', async (msg: any) => {
      console.log('[UpdateSync] 📢 Project updated notification received')
      
      // 如果是自己发送的更新，忽略
      if (msg.userId === this.wsClient.userId) {
        console.log('[UpdateSync] Ignoring own update notification')
        return
      }
      
      console.log('[UpdateSync] 🔄 Reloading project from database...')
      
      // 通知用户项目已更新
      const notification = document.createElement('div')
      notification.textContent = '项目已更新，正在重新加载...'
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `
      document.body.appendChild(notification)
      
      // 延迟重新加载，让用户看到通知
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    })
    
    console.log('[UpdateSync] Timeline synchronization started (database sync mode)')
    
    // 注释掉复杂的远程更新逻辑，因为我们现在使用数据库同步
    /*
    // 监听远程更新
    this.wsClient.onTimelineUpdate = (data: any) => {
      console.log('[UpdateSync] Timeline update received from server')
      // 检查数据格式 - 可能是 { updates: [...] } 或直接是数组
      const updates = Array.isArray(data) ? data : (data.updates || [])
      this.applyRemoteUpdates(updates)
    }
    
    // 监听快照响应
    this.wsClient.onTimelineSnapshot = (snapshot: any) => {
      console.log('[UpdateSync] Timeline snapshot response received')
      // Handle snapshot
    }
    
    // 监听快照请求
    this.wsClient.onTimelineSnapshotRequest = () => {
      console.log('[UpdateSync] Timeline snapshot requested by another user')
      this.sendFullSnapshot()
    }
    
    // 如果本地项目只有基础 Box，请求其他用户的快照
    if (initialBoxCount <= 6) {
      console.log('[UpdateSync] Local project only has base boxes, requesting snapshot from other users...')
      setTimeout(() => {
        this.requestInitialSync()
      }, 1000)
    }
    */
  }
  
  // 手动触发BoxGraph保存（公开方法，用于调试或手动保存）
  async triggerBoxGraphSave() {
    console.log('[UpdateSync] Manually triggering BoxGraph save...')
    await this.saveBoxGraphToServer()
  }
  
  stop() {
    if (this.subscription) {
      this.subscription.unsubscribe()
      this.subscription = null
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }
  
  private isTimelineUpdate(update: Update): boolean {
    const timelineBoxTypes = [
      // 核心必需的 Box（项目初始化时创建）
      'RootBox', 'UserInterfaceBox', 'SelectionBox',
      
      // Timeline 核心
      'TimelineBox', 'TrackBox',
      
      // 混音器（必需）
      'AudioUnitBox', 'AudioBusBox', 'AuxSendBox',
      
      // 音频内容
      'AudioRegionBox', 'AudioClipBox', 'AudioFileBox',
      
      // MIDI 内容
      'NoteRegionBox', 'NoteClipBox', 'NoteEventBox',
      'NoteEventRepeatBox', 'NoteEventCollectionBox',
      
      // 自动化
      'ValueRegionBox', 'ValueClipBox', 'ValueEventBox',
      'ValueEventCurveBox', 'ValueEventCollectionBox',
      'StepAutomationBox',
      
      // 标记
      'MarkerBox',
      
      // Groove
      'GrooveShuffleBox',
      
      // 效果器
      'ReverbDeviceBox', 'DelayDeviceBox', 'StereoToolDeviceBox',
      'RevampDeviceBox', 'ModularDeviceBox', 'DeviceInterfaceKnobBox',
      'ArpeggioDeviceBox', 'PitchDeviceBox', 'ZeitgeistDeviceBox',
      
      // 乐器
      'TapeDeviceBox', 'PlayfieldDeviceBox', 'PlayfieldSampleBox',
      'NanoDeviceBox', 'VaporisateurDeviceBox',
      
      // 模块化
      'ModularBox', 'ModuleConnectionBox',
      'ModularAudioInputBox', 'ModularAudioOutputBox',
      'ModuleDelayBox', 'ModuleGainBox', 'ModuleMultiplierBox',
      
      // 其他设备
      'DeviceClashBox'
    ]
    
    if (update.type === 'new' || update.type === 'delete') {
      const isTimeline = timelineBoxTypes.includes(update.name)
      console.log(`[UpdateSync] Checking ${update.type} update for ${update.name}: ${isTimeline}`)
      return isTimeline
    }
    
    if (update.type === 'primitive' || update.type === 'pointer') {
      const box = this.service.project.boxGraph.findBox(update.address.uuid)
      if (box.nonEmpty()) {
        const boxName = box.unwrap().name
        const isTimeline = timelineBoxTypes.includes(boxName)
        console.log(`[UpdateSync] Checking ${update.type} update for ${boxName}: ${isTimeline}`)
        return isTimeline
      } else {
        // 如果找不到 box，我们仍然接受这个更新
        // 因为它可能是针对即将创建的 box 的
        console.log(`[UpdateSync] Box not found for ${update.type} update, accepting it`)
        return true
      }
    }
    
    return false
  }
  
  // 处理本地更新
  private handleLocalUpdate(update: Update) {
    console.log('[UpdateSync] handleLocalUpdate called')
    
    if (this.isApplyingRemote) {
      console.log('[UpdateSync] Ignoring local update - applying remote')
      return
    }
    
    if (!this.wsClient.isConnected) {
      console.log('[UpdateSync] Ignoring local update - WebSocket not connected')
      return
    }
    
    // 添加到队列
    this.updateQueue.push(update)
    console.log(`[UpdateSync] Update queued, queue size: ${this.updateQueue.length}`)
    
    // 检查是否是第一次创建内容（超过基础的6个Box）
    const boxCount = Array.from(this.service.project.boxGraph.boxes()).length
    console.log(`[UpdateSync] Current box count: ${boxCount}, hasInitialContentSaved: ${this.hasInitialContentSaved}`)
    
    if (boxCount > 6 && !this.hasInitialContentSaved) {
      this.hasInitialContentSaved = true
      console.log('[UpdateSync] 🎯 First content created, triggering BoxGraph save...')
      // 延迟一下确保所有相关更新都完成
      setTimeout(() => {
        console.log('[UpdateSync] 🔥 Executing saveBoxGraphToServer...')
        this.saveBoxGraphToServer()
      }, 1000)
    }
    
    // 如果没有正在发送的批次，启动新批次
    if (this.sendTimeout === null) {
      this.sendTimeout = setTimeout(() => this.sendBatch(), 100) // Changed from BATCH_DELAY_MS to 100
    }
  }
  
  private sendBatch() {
    if (this.updateQueue.length === 0) return
    
    console.log(`[UpdateSync] Sending batch of ${this.updateQueue.length} updates`)
    
    try {
      const serialized = this.updateQueue.map(u => this.serializeUpdate(u))
      this.wsClient.send({
        type: 'TIMELINE_UPDATE',
        projectId: this.wsClient.projectId,
        userId: this.wsClient.userId,
        timestamp: Date.now(),
        data: { updates: serialized }
      })
      
      this.updateQueue = []
    } catch (error) {
      console.error('[UpdateSync] Failed to send batch:', error)
    }
  }
  
  private serializeUpdate(update: Update): any {
    const output = ByteArrayOutput.create()
    update.write(output)
    const bytes = new Uint8Array(output.toArrayBuffer())
    
    return {
      type: update.type,
      data: Array.from(bytes),
      // 添加调试信息
      debug: update.toString()
    }
  }
  
  private deserializeUpdate(serialized: any): Update | null {
    try {
      const bytes = new Uint8Array(serialized.data)
      const input = new ByteArrayInput(bytes.buffer)
      
      // 读取 update 类型
      const type = input.readString()
      
      switch (type) {
        case 'new': {
          const uuid = UUID.fromDataInput(input)
          const name = input.readString()
          const settingsLength = input.readInt()
          const settings = new Int8Array(settingsLength)
          input.readBytes(settings)
          return new NewUpdate(uuid, name, settings.buffer)
        }
        
        case 'primitive': {
          // PrimitiveUpdate 的反序列化
          const address = Address.read(input)
          const type: PrimitiveType = input.readString() as PrimitiveType
          const serializer: ValueSerialization = ValueSerialization[type]
          const oldValue = serializer.decode(input)
          const newValue = serializer.decode(input)
          return new PrimitiveUpdate(address, serializer, oldValue, newValue)
        }
        
        case 'pointer': {
          // PointerUpdate 的反序列化
          const address = Address.read(input)
          const oldAddress = input.readBoolean() ? Option.wrap(Address.read(input)) : Option.None
          const newAddress = input.readBoolean() ? Option.wrap(Address.read(input)) : Option.None
          return new PointerUpdate(address, oldAddress, newAddress)
        }
        
        case 'delete': {
          const uuid = UUID.fromDataInput(input)
          const name = input.readString()
          const settingsLength = input.readInt()
          const settings = new Int8Array(settingsLength)
          input.readBytes(settings)
          return new DeleteUpdate(uuid, name, settings.buffer)
        }
        
        default:
          console.error('[UpdateSync] Unknown update type:', type)
          return null
      }
    } catch (error) {
      console.error('[UpdateSync] Failed to deserialize update:', error, serialized)
      return null
    }
  }
  
  private async applyRemoteUpdates(serializedUpdates: any[]) {
    if (!serializedUpdates || serializedUpdates.length === 0) return
    
    console.log(`[UpdateSync] Applying ${serializedUpdates.length} remote updates`)
    
    const updates = serializedUpdates
      .map(s => this.deserializeUpdate(s))
      .filter(u => u !== null) as Update[]
    
    if (updates.length === 0) {
      console.warn('[UpdateSync] No valid updates to apply')
      return
    }
    
    // 检查是否有新的音频内容需要同步
    if (this.audioSyncManager) {
      for (const update of updates) {
        if (update.type === 'new' && 
            (update.name === 'AudioRegionBox' || update.name === 'AudioClipBox')) {
          console.log('[UpdateSync] New audio content detected, checking audio files...')
          // TODO: 实现音频检查逻辑
          // await this.audioSyncManager.checkNewRegion(update)
        }
      }
    }
    
    // 标记正在应用远程更新，避免循环
    this.isApplyingRemote = true
    
    try {
      // 分组更新：先处理所有 new 和 delete 更新，再处理依赖更新
      const newUpdates = updates.filter(u => u.type === 'new')
      const deleteUpdates = updates.filter(u => u.type === 'delete')
      const dependentUpdates = updates.filter(u => u.type === 'primitive' || u.type === 'pointer')
      
      // 检查 boxGraph 的实际 API
      console.log('[UpdateSync] BoxGraph API methods:', Object.getOwnPropertyNames(this.service.project.boxGraph).filter(name => !name.startsWith('_')))
      console.log('[UpdateSync] BoxGraph prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.service.project.boxGraph)).filter(name => !name.startsWith('_')))
      
      // 尝试不同的方法获取box数量
      let boxCount = 'unknown'
      if (typeof this.service.project.boxGraph.boxes === 'function') {
        const boxes = this.service.project.boxGraph.boxes()
        boxCount = boxes ? (boxes.size || boxes.length || Object.keys(boxes).length) : 'null'
      } else if (this.service.project.boxGraph.boxes) {
        boxCount = Object.keys(this.service.project.boxGraph.boxes).length
      }
      
      // 在 editing.modify 中分阶段应用更新
      console.log(`[UpdateSync] Starting transaction with box count: ${boxCount}`)
      this.service.project.editing.modify(() => {
        // 第一阶段：应用所有 new 更新
        console.log(`[UpdateSync] Phase 1: Applying ${newUpdates.length} new updates`)
        newUpdates.forEach(update => {
          try {
            console.log('[UpdateSync] Applying new update:', update.toString())
            const beforeCount = this.getBoxCount()
            update.forward(this.service.project.boxGraph)
            const afterCount = this.getBoxCount()
            console.log(`[UpdateSync] Box count: ${beforeCount} -> ${afterCount} (created: ${afterCount > beforeCount})`)
            
            // 验证box是否真的被创建了
            const createdBox = this.service.project.boxGraph.findBox(update.uuid)
            if (createdBox && createdBox.nonEmpty()) {
              console.log(`[UpdateSync] ✓ Box created successfully: ${createdBox.unwrap().name}`)
            } else {
              console.error(`[UpdateSync] ✗ Box creation failed - box not found after creation`)
            }
          } catch (error) {
            console.error('[UpdateSync] Failed to apply new update:', error, update)
          }
        })
        
        // 第二阶段：应用所有 delete 更新
        console.log(`[UpdateSync] Phase 2: Applying ${deleteUpdates.length} delete updates`)
        deleteUpdates.forEach(update => {
          try {
            console.log('[UpdateSync] Applying delete update:', update.toString())
            update.forward(this.service.project.boxGraph)
          } catch (error) {
            console.error('[UpdateSync] Failed to apply delete update:', error, update)
          }
        })
        
        // 第三阶段：应用依赖更新，带重试机制
        console.log(`[UpdateSync] Phase 3: Applying ${dependentUpdates.length} dependent updates`)
        const failedUpdates: Update[] = []
        
        // 先记录所有 pointer 的目标，用于调试
        dependentUpdates.forEach(update => {
          if (update.type === 'pointer' && update.newValue && update.newValue.nonEmpty()) {
            const target = update.newValue.unwrap()
            console.log(`[UpdateSync] PointerUpdate targets: ${target.toString()}`)
          }
        })
        
        dependentUpdates.forEach(update => {
          if (this.applyDependentUpdate(update)) {
            console.log('[UpdateSync] Successfully applied dependent update:', update.toString())
          } else {
            failedUpdates.push(update)
          }
        })
        
        // 重试失败的更新（最多重试2次）
        for (let retry = 0; retry < 2 && failedUpdates.length > 0; retry++) {
          console.log(`[UpdateSync] Retry ${retry + 1}: Attempting ${failedUpdates.length} failed updates`)
          const stillFailed: Update[] = []
          
          failedUpdates.forEach(update => {
            if (this.applyDependentUpdate(update)) {
              console.log('[UpdateSync] Successfully applied on retry:', update.toString())
            } else {
              stillFailed.push(update)
            }
          })
          
          failedUpdates.length = 0
          failedUpdates.push(...stillFailed)
        }
        
        // 报告最终失败的更新
        if (failedUpdates.length > 0) {
          console.warn(`[UpdateSync] ${failedUpdates.length} updates could not be applied after retries:`)
          failedUpdates.forEach(update => {
            console.warn('[UpdateSync] Final failure:', update.toString())
          })
        }
        
        // 在transaction结束前，再次检查所有box的状态
        const finalBoxCount = this.getBoxCount()
        console.log(`[UpdateSync] Final box count before transaction end: ${finalBoxCount}`)
        
        if (finalBoxCount === 0 && (newUpdates.length > 0 || dependentUpdates.length > 0)) {
          console.error('[UpdateSync] WARNING: Transaction ending with 0 boxes despite having updates!')
          console.error('[UpdateSync] This will likely cause pointer resolution failures.')
        }
      })
      
      // transaction结束后再次检查
      const postTransactionCount = this.getBoxCount()
      console.log(`[UpdateSync] Post-transaction box count: ${postTransactionCount}`)
      
      console.log('[UpdateSync] Successfully applied remote updates')
    } finally {
      this.isApplyingRemote = false
    }
  }
  
  private applyDependentUpdate(update: Update): boolean {
    try {
      // 为 PrimitiveUpdate 添加额外的调试信息
      if (update.type === 'primitive') {
        const targetBox = this.service.project.boxGraph.findBox(update.address.uuid)
        if (targetBox && targetBox.nonEmpty()) {
          const box = targetBox.unwrap()
          console.log(`[UpdateSync] Applying PrimitiveUpdate to ${box.name} (${update.address.uuid}):`, 
                     `field=${update.address.fieldKeys}, ${update.oldValue} -> ${update.newValue}`)
        } else {
          const uuidStr = Array.isArray(update.address.uuid) ? 
            update.address.uuid.map((b: number) => b.toString(16).padStart(2, '0')).join('') : 
            update.address.uuid.toString()
          console.warn(`[UpdateSync] PrimitiveUpdate target box not found: ${uuidStr}`)
          // 让我们看看发送端是否有这个box的信息
          this.debugMissingBox(uuidStr)
        }
      }
      
      // 直接尝试应用更新，让 OpenDAW 的内部逻辑处理验证
      update.forward(this.service.project.boxGraph)
      return true
    } catch (error) {
      const errorMessage = (error as Error).message || String(error)
      
      // 为 PrimitiveUpdate 提供更详细的错误信息
      if (update.type === 'primitive') {
        const targetBox = this.service.project.boxGraph.findBox(update.address.uuid)
        if (targetBox && targetBox.nonEmpty()) {
          const box = targetBox.unwrap()
          console.warn(`[UpdateSync] PrimitiveUpdate failed on ${box.name}:`, 
                      `field=${update.address.fieldKeys}, ${update.oldValue} -> ${update.newValue}, error: ${errorMessage}`)
          
          // 尝试获取box的字段信息来调试
          this.debugBoxFields(box, update.address.fieldKeys)
        } else {
          // Debug the missing box
          const uuidDebugStr = Array.isArray(update.address.uuid) ? 
            update.address.uuid.join(',') : 
            String(update.address.uuid)
          this.debugMissingBox(uuidDebugStr)
          console.warn(`[UpdateSync] PrimitiveUpdate failed - box not found:`, update.toString(), errorMessage)
        }
      } else if (errorMessage.includes('Could not find PrimitiveField')) {
        console.debug('[UpdateSync] Field not found (may be expected):', update.toString())
      } else if (errorMessage.includes('could not be resolved')) {
        console.debug('[UpdateSync] Reference not resolved (may be expected):', update.toString())
      } else {
        console.warn('[UpdateSync] Failed to apply dependent update:', errorMessage, update.toString())
      }
      return false
    }
  }
  
  private getBoxCount(): number {
    try {
      if (typeof this.service.project.boxGraph.boxes === 'function') {
        const boxes = this.service.project.boxGraph.boxes()
        if (boxes && typeof boxes.size === 'number') {
          return boxes.size
        } else if (boxes && Array.isArray(boxes)) {
          return boxes.length
        } else if (boxes && typeof boxes === 'object') {
          return Object.keys(boxes).length
        }
      } else if (this.service.project.boxGraph.boxes && typeof this.service.project.boxGraph.boxes === 'object') {
        return Object.keys(this.service.project.boxGraph.boxes).length
      }
      
      // 尝试其他可能的方法
      if (typeof this.service.project.boxGraph.allBoxes === 'function') {
        const allBoxes = this.service.project.boxGraph.allBoxes()
        return allBoxes ? allBoxes.length : 0
      }
      
      return 0
    } catch (e) {
      console.warn('[UpdateSync] Error getting box count:', e)
      return 0
    }
  }

  private debugMissingBox(uuidStr: string): void {
    console.log(`[UpdateSync] Debugging missing box ${uuidStr}:`)
    
    try {
      // Try to parse as byte array string
      const byteArray = uuidStr.split(',').map(b => parseInt(b))
      // Convert byte array to standard UUID format
      const hex = byteArray.map(b => b.toString(16).padStart(2, '0')).join('')
      const standardUuid = [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
      ].join('-')
      
      console.log(`[UpdateSync] Byte array UUID: ${uuidStr}`)
      console.log(`[UpdateSync] Standard UUID: ${standardUuid}`)
      
      const boxCount = this.getBoxCount()
      console.log(`[UpdateSync] Total boxes in graph: ${boxCount}`)
      
      // List all existing boxes with both UUID formats
      const boxes = Array.from(this.service.project.boxGraph.boxes())
      boxes.forEach((box, index) => {
        try {
          const uuid = box.address.uuid
          let uuidStr = ''
          
          if (Array.isArray(uuid)) {
            // UUID as byte array
            const byteStr = uuid.join(',')
            const hexStr = uuid.map((b: number) => b.toString(16).padStart(2, '0')).join('')
            const standardStr = [
              hexStr.slice(0, 8),
              hexStr.slice(8, 12),
              hexStr.slice(12, 16),
              hexStr.slice(16, 20),
              hexStr.slice(20, 32)
            ].join('-')
            console.log(`[UpdateSync] Box ${index}: ${box.name}`)
            console.log(`  - Byte array: ${byteStr}`)
            console.log(`  - Standard: ${standardStr}`)
          } else if (typeof uuid === 'string') {
            console.log(`[UpdateSync] Box ${index}: ${box.name} (${uuid})`)
          } else {
            console.log(`[UpdateSync] Box ${index}: ${box.name} (unknown UUID format)`)
          }
        } catch (e) {
          console.log(`[UpdateSync] Box ${index}: ${(box as any).name} (error reading UUID)`)
        }
      })
    } catch (e) {
      console.log(`[UpdateSync] Error in debugMissingBox:`, e)
    }
  }
  
  private listExistingBoxes() {
    try {
      // 尝试不同的方法获取box列表
      if (typeof this.service.project.boxGraph.boxes === 'function') {
        const boxes = this.service.project.boxGraph.boxes()
        if (boxes && typeof boxes.forEach === 'function') {
          // Map 或 Array
          let count = 0
          boxes.forEach((box: any, uuid: any) => {
            if (count >= 5) return
            const boxUuidStr = Array.isArray(uuid) ? 
              uuid.map((b: number) => b.toString(16).padStart(2, '0')).join('') : 
              uuid.toString()
            console.log(`[UpdateSync] Existing box: ${box.name} (${boxUuidStr})`)
            count++
          })
        } else if (boxes && typeof boxes === 'object') {
          // Plain object
          let count = 0
          for (const [uuid, box] of Object.entries(boxes)) {
            if (count >= 5) break
            console.log(`[UpdateSync] Existing box: ${(box as any).name} (${uuid})`)
            count++
          }
        }
      } else if (this.service.project.boxGraph.boxes && typeof this.service.project.boxGraph.boxes === 'object') {
        // Direct object access
        let count = 0
        for (const [uuid, box] of Object.entries(this.service.project.boxGraph.boxes)) {
          if (count >= 5) break
          console.log(`[UpdateSync] Existing box: ${(box as any).name} (${uuid})`)
          count++
        }
      }
    } catch (e) {
      console.log(`[UpdateSync] Error listing boxes:`, e)
    }
  }

  private debugBoxFields(box: any, fieldKeys: any) {
    console.log(`[UpdateSync] Debugging ${box.name} fields:`)
    console.log(`[UpdateSync] Requested field keys:`, fieldKeys)
    
    // 尝试获取box的可用字段信息
    try {
      // 检查box是否有fields或schema信息
      if (box.fields) {
        console.log(`[UpdateSync] Available fields:`, Object.keys(box.fields))
      } else if (box.schema) {
        console.log(`[UpdateSync] Schema info:`, box.schema)
      } else {
        console.log(`[UpdateSync] Box structure:`, Object.keys(box))
      }
    } catch (e) {
      console.log(`[UpdateSync] Could not inspect box fields:`, e)
    }
  }
  
  // 检查是否应该等待快照（第二个用户不应该有自己的项目）
  private shouldWaitForSnapshot(): boolean {
    const boxCount = Array.from(this.service.project.boxGraph.boxes()).length
    
    // 如果本地已经有Box（但只有基础的6个），可能需要等待快照
    if (boxCount === 6) {
      console.log('[UpdateSync] Local project only has base boxes, might need snapshot from other users')
      return true
    }
    
    // 如果已经有更多Box，说明是有内容的项目
    if (boxCount > 6) {
      console.log('[UpdateSync] Local project already has content')
      return false
    }
    
    return false
  }
  
  // 请求初始同步
  async requestInitialSync() {
    console.log('[UpdateSync] Requesting initial timeline snapshot...')
    
    // 检查本地Box数量
    const localBoxCount = Array.from(this.service.project.boxGraph.boxes()).length
    console.log(`[UpdateSync] Local box count: ${localBoxCount}`)
    
    // 始终请求快照，让发送端决定是否响应
    console.log('[UpdateSync] Sending snapshot request to server...')
    this.wsClient.send({
      type: 'TIMELINE_SNAPSHOT_REQUEST',
      projectId: this.wsClient.projectId,
      userId: this.wsClient.userId,
      timestamp: Date.now(),
      data: {}
    })
    
    console.log('[UpdateSync] Snapshot request sent')
    
    // 如果应该等待快照，给一些时间让快照到达
    if (this.shouldWaitForSnapshot()) {
      console.log('[UpdateSync] Waiting for snapshot response...')
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  // 发送初始核心 Box
  private async sendInitialBoxes() {
    console.log('[UpdateSync] Sending initial core boxes...')
    
    const coreBoxTypes = [
      'UserInterfaceBox', 'SelectionBox',
      'TimelineBox', 'AudioBusBox', 'AudioUnitBox',
      'GrooveShuffleBox', 'StepAutomationBox',
      'RootBox', 'UserInterfaceBox', 'SelectionBox',
      
      // Timeline 核心
      'TrackBox','AuxSendBox', 'MarkerBox',
      
      // 音频内容
      'AudioRegionBox', 'AudioClipBox', 'AudioFileBox',
      
      // MIDI 内容
      'NoteRegionBox', 'NoteClipBox', 'NoteEventBox',
      'NoteEventRepeatBox', 'NoteEventCollectionBox',
      
      // 自动化
      'ValueRegionBox', 'ValueClipBox', 'ValueEventBox',
      'ValueEventCurveBox', 'ValueEventCollectionBox',
      
      // 效果器
      'ReverbDeviceBox', 'DelayDeviceBox', 'StereoToolDeviceBox',
      'RevampDeviceBox', 'ModularDeviceBox', 'DeviceInterfaceKnobBox',
      'ArpeggioDeviceBox', 'PitchDeviceBox', 'ZeitgeistDeviceBox',
      
      // 乐器
      'TapeDeviceBox', 'PlayfieldDeviceBox', 'PlayfieldSampleBox',
      'NanoDeviceBox', 'VaporisateurDeviceBox',
      
      // 模块化
      'ModularBox', 'ModuleConnectionBox',
      'ModularAudioInputBox', 'ModularAudioOutputBox',
      'ModuleDelayBox', 'ModuleGainBox', 'ModuleMultiplierBox',
      
      // 其他设备
      'DeviceClashBox'
      
    ]
    
    const coreBoxes: Box[] = []
    
    // 收集所有核心 Box
    const allBoxes = this.service.project.boxGraph.boxes()
    allBoxes.forEach((box: Box) => {
      if (coreBoxTypes.includes(box.name)) {
        coreBoxes.push(box)
      }
    })
    
    console.log(`[UpdateSync] Found ${coreBoxes.length} core boxes to send`)
    
    // 为每个核心 Box 创建 NewUpdate
    const updates: Update[] = []
    for (const box of coreBoxes) {
      try {
        // 创建 NewUpdate
        const output = ByteArrayOutput.create()
        box.write(output)
        const settings = new Uint8Array(output.toArrayBuffer())
        
        const update = new NewUpdate(
          box.address.uuid,
          box.name,
          settings.buffer
        )
        
        updates.push(update)
        console.log(`[UpdateSync] Created NewUpdate for ${box.name}`)
      } catch (error) {
        console.error(`[UpdateSync] Failed to create update for ${box.name}:`, error)
      }
    }
    
    // 批量发送所有核心 Box 的 NewUpdate
    if (updates.length > 0) {
      const serialized = updates.map(u => this.serializeUpdate(u))
      this.wsClient.send({
        type: 'TIMELINE_UPDATE',
        projectId: this.wsClient.projectId,
        userId: this.wsClient.userId,
        timestamp: Date.now(),
        data: { 
          updates: serialized,
          isInitialSync: true // 标记这是初始同步
        }
      })
      
      console.log(`[UpdateSync] Sent ${updates.length} initial core box updates`)
    }
  }
  
  // 发送完整的快照 (公开用于调试)
  async sendFullSnapshot(requesterId?: string) {
    console.log('[UpdateSync] Sending full project snapshot...')
    
    try {
      // 使用BoxGraph的toArrayBuffer方法获取完整快照
      const snapshotBuffer = this.service.project.boxGraph.toArrayBuffer()
      const snapshot = Array.from(new Uint8Array(snapshotBuffer))
      const boxCount = Array.from(this.service.project.boxGraph.boxes()).length
      
      console.log(`[UpdateSync] Created snapshot: ${snapshot.length} bytes, ${boxCount} boxes`)
      
      // 发送快照
      this.wsClient.send({
        type: 'TIMELINE_SNAPSHOT_RESPONSE',
        projectId: this.wsClient.projectId,
        userId: this.wsClient.userId,
        timestamp: Date.now(),
        data: {
          snapshot: snapshot,  // 使用toArrayBuffer格式
          boxCount: boxCount,
          requesterId
        }
      })
      
      console.log(`[UpdateSync] Sent full project snapshot`)
    } catch (error) {
      console.error('[UpdateSync] Failed to send snapshot:', error)
    }
  }

  // 处理快照响应
  handleSnapshotResponse(data: any) {
    console.log('[UpdateSync] Received timeline snapshot')
    
    if (!data || (!data.snapshot && !data.updates)) {
      console.log('[UpdateSync] No snapshot data')
      return
    }
    
    this.isApplyingRemote = true
    try {
      // 如果是旧格式（toArrayBuffer快照）
      if (data.snapshot && data.snapshot.length > 0) {
        console.log(`[UpdateSync] Applying full project snapshot (${data.snapshot.length} bytes, ${data.boxCount} boxes)`)
        
        // 获取当前Box数量
        const currentBoxCount = Array.from(this.service.project.boxGraph.boxes()).length
        console.log(`[UpdateSync] Current box count: ${currentBoxCount}`)
        
        // 如果本地已有Box，说明需要替换整个项目
        if (currentBoxCount > 0) {
          console.warn('[UpdateSync] ⚠️ Cannot replace non-empty BoxGraph with fromArrayBuffer')
          console.warn('[UpdateSync] This is a known limitation. Two options:')
          console.warn('[UpdateSync] 1. Refresh the page to start with an empty project')
          console.warn('[UpdateSync] 2. Wait for a proper project replacement implementation')
          
          // 临时解决方案：显示警告对话框
          alert('协作同步需要刷新页面。请刷新浏览器后重新加入房间。\n\nCollaboration sync requires a page refresh. Please refresh your browser and rejoin the room.')
          return
        }
        
        // BoxGraph是空的，可以直接应用快照
        const buffer = new Uint8Array(data.snapshot).buffer
        this.service.project.editing.modify(() => {
          this.service.project.boxGraph.fromArrayBuffer(buffer)
        })
        
        const finalCount = Array.from(this.service.project.boxGraph.boxes()).length
        console.log(`[UpdateSync] Snapshot applied successfully. Final box count: ${finalCount}`)
      } else if (data.updates && data.updates.length > 0) {
        // 新格式（个别NewUpdate）- 作为备用方案
        console.log(`[UpdateSync] Applying snapshot with ${data.updates.length} box updates`)
        console.log('[UpdateSync] Applying incremental snapshot (fallback mode)')
        this.applyRemoteUpdates(data.updates)
      }
      
      // 如果有音频同步管理器，检查缺失的音频文件
      if (this.audioSyncManager) {
        console.log('[UpdateSync] Checking for missing audio files...')
        // TODO: 实现音频文件检查
      }
    } catch (error) {
      console.error('[UpdateSync] Failed to apply snapshot:', error)
    } finally {
      this.isApplyingRemote = false
    }
  }
} 