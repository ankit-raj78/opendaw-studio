interface FileSystemFileHandle {
    createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>
}

interface FileSystemSyncAccessHandle {
    write(buffer: BufferSource, options?: { at?: number }): number
    read(buffer: BufferSource, options?: { at?: number }): number
    getSize(): number
    truncate(newSize: number): void
    flush(): void
    close(): void
}

interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface SaveFilePickerOptions {
    suggestedName?: string
    types?: Array<{
        description: string
        accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
}

interface OpenFilePickerOptions {
    multiple?: boolean
    types?: Array<{
        description: string
        accept: Record<string, string[]>
    }>
    excludeAcceptAllOption?: boolean
}

interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
}

type AudioSinkInfo = string | { type: "none" }

interface AudioContext {
    setSinkId(id: AudioSinkInfo): Promise<void>
    get sinkId(): AudioSinkInfo
}