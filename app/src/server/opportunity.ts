type OpportunityBase = {
  id: string
  timestamp: number
  trigger: string
}

export type QuestionOpportunity = {
  type: "question"
  shortAnswer: string
  longAnswer: string
} & OpportunityBase

export type SearchOpportunity = {
  type: "search"
  trigger: string
  searchQuery: string
  answer: string
  images: {
    url: string
    description: string
  }[]
  results: {
    url: string
    title: string
    content: string
  }[]
} & OpportunityBase

export type GenerativeOpportunity = {
  type: "generative"
  trigger: string
  imagePrompt: string
  imageUrl: string
} & OpportunityBase

export type Opportunity =
  | QuestionOpportunity
  | SearchOpportunity
  | GenerativeOpportunity
