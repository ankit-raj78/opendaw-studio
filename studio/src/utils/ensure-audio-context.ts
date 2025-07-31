// Helper function to ensure AudioContext is running
export async function ensureAudioContextRunning(context: AudioContext): Promise<boolean> {
    if (!context) {
        console.error('❌ No AudioContext available')
        return false
    }
    
    if (context.state === 'suspended') {
        console.log('🔊 AudioContext is suspended, attempting to resume...')
        try {
            await context.resume()
            console.log('✅ AudioContext resumed successfully, state:', context.state)
            return true
        } catch (error) {
            console.error('❌ Failed to resume AudioContext:', error)
            return false
        }
    } else if (context.state === 'running') {
        console.log('✅ AudioContext is already running')
        return true
    } else {
        console.warn('⚠️ AudioContext in unexpected state:', context.state)
        return false
    }
} 