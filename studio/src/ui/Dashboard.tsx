import css from "./Dashboard.sass?inline"
import {Lifecycle, TimeSpan} from "std"
import {createElement, LocalLink} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Colors} from "@/ui/Colors.ts"
import {Html} from "dom"
import {ProjectBrowser} from "@/project/ProjectBrowser"
import {showProcessMonolog} from "@/ui/components/dialogs"

const className = Html.adoptStyleSheet(css, "Dashboard")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const Dashboard = ({service}: Construct) => {
    // 🚀 OPTIMIZATION: Skip dashboard in collaborative mode
    // Check if we're in collaborative mode and should bypass this dashboard
    const urlParams = new URLSearchParams(window.location.search)
    const isCollaborative = urlParams.get('collaborative') === 'true'
    const projectId = urlParams.get('projectId')
    const userId = urlParams.get('userId')
    
    if (isCollaborative && projectId && userId) {
        console.log('🚀 Dashboard: Detected collaborative mode, creating session and switching to workspace...')
        
        // Create a minimal session to ensure workspace loads
        if (!service.hasProjectSession) {
            service.cleanSlate() // Creates new project session
        }
        
        // Immediately switch to workspace
        setTimeout(() => {
            service.switchScreen("default")
        }, 100)
        
        // Return a minimal loading state instead of full dashboard
        return (
            <div className={className}>
                <article style={{textAlign: "center", padding: "2rem"}}>
                    <h2>Loading Collaborative Workspace...</h2>
                    <p>Preparing your project...</p>
                </article>
            </div>
        )
    }

    const time = TimeSpan.millis(new Date(service.buildInfo.date).getTime() - new Date().getTime()).toUnitString()
    return (
        <div className={className}>
            <article>
                <h1>Welcome to openDAW</h1>
                <h2>A new holistic exploration of music creation inside your browser</h2>
                <p style={{margin: "1em 0 0 0"}}>
                    This is an <span className="highlight">early prototype</span> giving you an early glimpse of the
                    development
                    state.
                </p>
                <div className="columns">
                    <div>
                        <h3>Templates</h3>
                        <div className="starters">
                            {[
                                {name: "New", click: () => service.cleanSlate()},
                                {name: "Sunset", click: () => service.loadTemplate("Sunset")},
                                {name: "Breeze", click: () => service.loadTemplate("Breeze")},
                                {name: "Shafted", click: () => service.loadTemplate("Shafted")},
                                {name: "Seek Deeper", click: () => service.loadTemplate("SeekDeeper")},
                                {name: "Fatso", click: () => service.loadTemplate("Fatso")},
                                {name: "Bury Me", click: () => service.loadTemplate("BuryMe")},
                                {
                                    name: "Bury Me (BMX Remix)",
                                    click: () => service.loadTemplate("BMX_Skyence_buryme_Remix")
                                },
                                {name: "Ben", click: () => service.loadTemplate("Ben")},
                                {name: "Liquid", click: () => service.loadTemplate("BMX_LiquidDrums")},
                                {name: "Release", click: () => service.loadTemplate("Release")},
                                {name: "Dub Techno", click: () => service.loadTemplate("Dub-Techno")}
                            ].map(({name, click}, index) => (
                                <div onclick={click}>
                                    <img src={`viscious-speed/abstract-${String(index).padStart(3, "0")}.svg`} alt=""/>
                                    <label>{name}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h3>Your Projects</h3>
                        <ProjectBrowser service={service}
                                        select={async ([uuid, meta]) => {
                                            const handler = showProcessMonolog("Loading...")
                                            await service.sessionService.loadExisting(uuid, meta)
                                            handler.close()
                                        }}/>
                    </div>
                </div>
                <p style={{marginTop: "1.5em", fontSize: "0.625em"}}>
                    Last built was <span style={{color: Colors.green}}>{time}</span>. Join our <a
                    href="https://discord.opendaw.studio" target="discord" style={{color: Colors.blue}}>discord
                    community</a> to stay updated! · <a href="https://github.com/andremichelle/opendaw"
                                                        target="github"
                                                        style={{color: Colors.blue}}>sourcecode</a> · <LocalLink
                    href="/imprint">imprint</LocalLink> · Built with ❤️
                </p>
            </article>
        </div>
    )
}