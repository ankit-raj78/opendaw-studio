declare module 'jsx' {
  import { ReactNode } from 'react'
  
  export type DomElement = HTMLElement | SVGElement
  export type JsxValue = null | undefined | boolean | string | number | DomElement | Array<JsxValue>
  
  export function createElement(tag: string, props?: any, ...children: any[]): ReactNode
  export function replaceChildren(element: Element, ...children: JsxValue[]): void
  export function appendChildren(element: Element, ...children: JsxValue[]): void
  
  // Route location class
  export class RouteLocation {
    static get(): RouteLocation
    navigateTo(path: string): boolean
    catchupAndSubscribe(observer: any): any
    get path(): string
  }
  
  // JSX components - override their return types to be React compatible
  export const Await: React.FC<{
    factory: () => Promise<any>
    loading: () => ReactNode
    success: (data: any) => ReactNode
    failure: (error: {reason: any}) => ReactNode
  }>
  export const Frag: React.FC<{children?: ReactNode}>
  export const Group: React.FC<{children?: ReactNode}>
  export const Hotspot: React.FC<any>
  export const LocalLink: React.FC<any>
  export const Router: React.FC<any>
  export const Preloader: React.FC<any>
  
  // Inject utilities
  export namespace Inject {
    export type ClassList = any
    export type Attribute = any
    export type Ref<T> = any
  }
}
