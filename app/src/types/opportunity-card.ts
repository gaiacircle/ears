export interface OpportunityCard {
  id: string
  timestamp: number
  type: "question" | "memory" | "generative"
  trigger: string
  content: string
  explanation: string
  imageUrl?: string
}
