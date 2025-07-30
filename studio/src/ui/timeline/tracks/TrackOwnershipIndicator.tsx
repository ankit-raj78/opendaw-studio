import React, { useEffect, useState } from 'react'
import { TrackBoxAdapter } from '@/audio-engine-shared/adapters/timeline/TrackBoxAdapter'
import { UUID } from 'std'

interface TrackOwnershipIndicatorProps {
  trackAdapter: TrackBoxAdapter
  currentUserId: string
}

export const TrackOwnershipIndicator: React.FC<TrackOwnershipIndicatorProps> = ({
  trackAdapter,
  currentUserId
}) => {
  const [isOwner, setIsOwner] = useState<boolean | null>(null)
  const [ownerName, setOwnerName] = useState<string>('')
  
  useEffect(() => {
    checkOwnership()
  }, [trackAdapter])
  
  const checkOwnership = async () => {
    try {
      const trackUuid = UUID.toString(trackAdapter.uuid)
      const token = (window as any).getAuthToken?.()?.token
      
      if (!token) {
        console.error('No auth token available')
        return
      }
      
      const response = await fetch(`http://localhost:8000/api/tracks/${trackUuid}/ownership`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        const isCurrentUserOwner = data.owner_id === parseInt(currentUserId)
        setIsOwner(isCurrentUserOwner)
        
        // 可选：获取所有者名称
        if (!isCurrentUserOwner) {
          // 这里可以调用另一个 API 获取用户名
          setOwnerName(`User ${data.owner_id}`)
        }
      } else if (response.status === 404) {
        // 轨道还没有所有者，当前用户可以认领
        setIsOwner(null)
      }
    } catch (error) {
      console.error('Error checking track ownership:', error)
    }
  }
  
  const getIndicatorStyle = (): React.CSSProperties => {
    if (isOwner === true) {
      return {
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }
    } else if (isOwner === false) {
      return {
        backgroundColor: '#f44336',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        opacity: 0.8
      }
    } else {
      return {
        backgroundColor: '#2196F3',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px'
      }
    }
  }
  
  const getIcon = () => {
    if (isOwner === true) {
      return '✓' // 可编辑
    } else if (isOwner === false) {
      return '🔒' // 锁定
    } else {
      return '?' // 未认领
    }
  }
  
  const getTooltip = () => {
    if (isOwner === true) {
      return '您可以编辑此轨道'
    } else if (isOwner === false) {
      return `此轨道属于 ${ownerName}`
    } else {
      return '此轨道尚未认领'
    }
  }
  
  return (
    <div 
      style={getIndicatorStyle()}
      title={getTooltip()}
    >
      <span>{getIcon()}</span>
      <span>{isOwner === true ? '可编辑' : isOwner === false ? '只读' : '未认领'}</span>
    </div>
  )
} 