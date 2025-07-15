/// <reference types="vite/client" />

declare module 'vite-plugin-cross-origin-isolation' {
  import { Plugin } from 'vite'
  
  interface CrossOriginIsolationOptions {
    headers?: Record<string, string>
  }
  
  function crossOriginIsolation(options?: CrossOriginIsolationOptions): Plugin
  export default crossOriginIsolation
}