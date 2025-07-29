export interface OpportunityCard {
  id: string
  timestamp: number
  type: "question" | "search" | "generative"
  trigger: string
  content: string
  imageUrl?: string
}
