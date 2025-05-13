// This json gets created right before building (check ../vite.config.ts) and stored in public folder.
export type BuildInfo = {
	date: number,
	uuid: string,
	env: "production" | "development",
}