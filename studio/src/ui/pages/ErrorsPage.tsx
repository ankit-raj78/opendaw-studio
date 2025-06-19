import css from "./ErrorsPage.sass?inline"
import {Await, createElement, Group, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {ThreeDots} from "@/ui/spinner/ThreeDots.tsx"
import {EmptyExec, isDefined, TimeSpan} from "std"
import {showDialog} from "@/ui/components/dialogs.tsx"
import {LogBuffer} from "@/LogBuffer.ts"

const className = Html.adoptStyleSheet(css, "ErrorsPage")

type Entry = {
    id: string
    date: string
    user_agent: string
    build_uuid: string
    build_env: string
    build_date: string
    script_tags: string
    error_name: string
    error_message: string
    error_stack: string
    logs: string
}

// TODO We will introduce a better ux later

export const ErrorsPage: PageFactory<StudioService> = ({service, path}: PageContext<StudioService>) => {
    return (
        <div className={className}>
            <h2>Open Errors (prototype)</h2>
            <Await factory={() => fetch(`https://logs.opendaw.studio/list.php`).then(x => x.json())}
                   failure={(error) => `Unknown request (${error.reason})`}
                   loading={() => <ThreeDots/>}
                   success={(json: ReadonlyArray<Entry>) => (
                       <div className="list">
                           <Group>
                               <h4>#</h4>
                               <h4>Time</h4>
                               <h4>Build</h4>
                               <h4>Type</h4>
                               <h4>Scripts</h4>
                               <h4>Stack</h4>
                               <h4>Log</h4>
                           </Group>
                           {json.map((log) => {
                                   const nowTime = new Date().getTime()
                                   const errorTime = new Date(log.date).getTime()
                                   const errorTimeString = TimeSpan.millis(errorTime - nowTime).toUnitString()
                                   const buildTimeString = TimeSpan.millis(new Date(log.build_date).getTime() - nowTime).toUnitString()
                                   return (
                                       <Group>
                                           <div>{log.id}</div>
                                           <div>{errorTimeString}</div>
                                           <div>{buildTimeString}</div>
                                           <div>{log.error_name}</div>
                                           <div>{log.script_tags}</div>
                                           <div style={{cursor: "pointer"}}
                                                onclick={() => showDialog({
                                                    headline: "Error Stack",
                                                    content: (
                                                        <pre style={{
                                                            overflow: "auto",
                                                            maxHeight: "20rem",
                                                            fontSize: "0.625rem",
                                                            outline: "none"
                                                        }}>
                                                       {log.error_stack}
                                                   </pre>
                                                    )
                                                }).catch(EmptyExec)}>
                                               📂
                                           </div>
                                           <div style={{cursor: "pointer"}}
                                                onclick={() => showDialog({
                                                    headline: "Studio Log",
                                                    content: (
                                                        <pre style={{
                                                            overflow: "auto",
                                                            maxHeight: "20rem",
                                                            fontSize: "0.625rem",
                                                            outline: "none",
                                                            display: "grid",
                                                            columnGap: "1em",
                                                            gridTemplateColumns: "auto auto 1fr"
                                                        }}>
                                                       {
                                                           (JSON.parse(log.logs) as Array<LogBuffer.Entry>)
                                                               .reverse()
                                                               .map(({time, level, args}) => {
                                                                   const logTime = TimeSpan.millis(new Date(time).getTime() - errorTime).toUnitString()
                                                                   return (
                                                                       <Group>
                                                                           <span>{level}</span>
                                                                           <span>{logTime}</span>
                                                                           {renderLog(args.at(0), ...args.slice(1))}
                                                                       </Group>
                                                                   )
                                                               })}
                                                   </pre>
                                                    )
                                                }).catch(EmptyExec)}>
                                               📂
                                           </div>
                                       </Group>
                                   )
                               }
                           )}
                       </div>
                   )}
            />
        </div>
    )
}

const renderLog = (format?: string, ...args: string[]): HTMLElement => {
    const container = (<div style={{display: "inline"}}></div>)
    if (!isDefined(format)) {return container}
    let argIndex = 0
    let style: Partial<CSSStyleDeclaration> = {}
    const regex = /%[cdfiosO%]/g
    let lastIndex = 0
    const matches = [...format.matchAll(regex)]
    if (matches.length === 0) {
        container.appendChild(makeSpan([format, ...args].join(" "), {}))
        return container
    }
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i][0]
        const index = matches[i].index!
        const raw = format.slice(lastIndex, index)
        if (isDefined(raw) && raw.length > 0) {
            container.appendChild(makeSpan(raw, style))
        }
        if (match === "%%") {
            container.appendChild(makeSpan("%", style))
        } else if (match === "%c") {
            const cssText = args[argIndex++]
            if (isDefined(cssText)) {
                style = parseStyle(cssText)
            } else {
                style = {}
            }
        } else {
            const val = args[argIndex++]
            if (isDefined(val)) {
                container.appendChild(makeSpan(formatToken(match, val), style))
            }
        }
        lastIndex = index + match.length
    }
    const tail = format.slice(lastIndex)
    if (isDefined(tail) && tail.length > 0) {
        container.appendChild(makeSpan(tail, style))
    }
    return container
}

const makeSpan = (text: string, style: Partial<CSSStyleDeclaration>): HTMLSpanElement => {
    const span = document.createElement("span")
    span.textContent = text
    Object.assign(span.style, style)
    return span
}

const formatToken = (token: string, val: any): string => {
    switch (token) {
        case "%d":
        case "%i":
            return parseInt(val).toString()
        case "%f":
            return parseFloat(val).toString()
        case "%s":
            return String(val)
        case "%o":
        case "%O":
            return typeof val === "object" ? JSON.stringify(val) : String(val)
        default:
            return String(val)
    }
}

const parseStyle = (input: string): Partial<CSSStyleDeclaration> => {
    const result: Partial<CSSStyleDeclaration> = {}
    for (const part of input.split(";")) {
        const [key, value] = part.split(":").map(s => s.trim())
        if (!isDefined(key) || !isDefined(value) || key.length === 0 || value.length === 0) {continue}
        const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        (result as any)[camel] = value
    }
    return result
}