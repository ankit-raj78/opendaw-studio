import { Project } from '../project/Project'

export interface SerializedProject {
  projectId: string
  serializedData: ArrayBufferLike
  timestamp: number
  version: string
}

export class ProjectSerializer {
  /**
   * Serializes a Project instance to ArrayBuffer using OpenDAW's native serialization
   */
  static serialize(project: Project, projectId: string): SerializedProject {
    const serializedData = project.toArrayBuffer()
    
    return {
      projectId,
      serializedData,
      timestamp: Date.now(),
      version: '1.0.0' // We can track format versions for future migrations
    }
  }

  /**
   * Deserializes ArrayBuffer to restore project state using OpenDAW's native deserialization
   * Note: This requires access to StudioService to create a new Project instance
   */
  static deserialize(service: any, serializedProject: SerializedProject): Project {
    // Use OpenDAW's Project.load method which calls ProjectDecoder.decode internally
    return Project.load(service, serializedProject.serializedData as ArrayBuffer)
  }

  /**
   * Converts SerializedProject to a format suitable for database storage
   */
  static toStorageFormat(serializedProject: SerializedProject): any {
    return {
      projectId: serializedProject.projectId,
      data: Array.from(new Uint8Array(serializedProject.serializedData)), // Convert to array for JSON storage
      timestamp: serializedProject.timestamp,
      version: serializedProject.version,
      type: 'opendaw-serialized-project'
    }
  }

  /**
   * Converts database storage format back to SerializedProject
   */
  static fromStorageFormat(stored: any): SerializedProject {
    return {
      projectId: stored.projectId,
      serializedData: new Uint8Array(stored.data).buffer, // Convert back to ArrayBuffer
      timestamp: stored.timestamp,
      version: stored.version
    }
  }
}
