import css from "./ErrorsPage.sass?inline"
import {Await, createElement, Group, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {ThreeDots} from "@/ui/spinner/ThreeDots.tsx"
import {EmptyExec, TimeSpan} from "std"
import {showDialog} from "@/ui/components/dialogs.tsx"
import {LogBuffer} from "@/LogBuffer.ts"
import {Logs} from "@/ui/pages/errors/Logs.tsx"

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
                               <h4>Browser</h4>
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
                                           <div>{log.user_agent.replace(/^Mozilla\/[\d.]+\s*/, "")}</div>
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
                                                onclick={() => {
                                                    const entries = JSON.parse(log.logs) as Array<LogBuffer.Entry>
                                                    return showDialog({
                                                        headline: "Studio Log",
                                                        content: (
                                                            <Logs errorTime={errorTime}
                                                                  entries={entries.reverse()}/>
                                                        )
                                                    }).catch(EmptyExec)
                                                }}>
                                               📂
                                           </div>
                                       </Group>
                                   )
                               }
                           )}
                       </div>
                   )}/>
        </div>
    )
}