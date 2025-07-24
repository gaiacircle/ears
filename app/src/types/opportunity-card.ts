export interface OpportunityCard {
	id: string
	type: "question" | "memory" | "generative"
	trigger: string
	content: string
	explanation: string
	timestamp: number
}
