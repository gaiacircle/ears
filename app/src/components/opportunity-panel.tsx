import { HelpCircle, ImageIcon, Search } from "lucide-react"

import type {
  Opportunity,
  QuestionOpportunity,
  SearchOpportunity,
  GenerativeOpportunity,
} from "@/server/opportunity"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSmartAutoscroll } from "@/hooks/use-smart-autoscroll"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./ui/carousel"

const getCardIcon = (type: Opportunity["type"]) => {
  // biome-ignore format: easy reading
  switch (type) {
    case "question":   return <HelpCircle className="w-4 h-4" />
    case "search":     return <Search className="w-4 h-4" />
    case "generative": return <ImageIcon className="w-4 h-4" />
    default:           return <HelpCircle className="w-4 h-4" />
  }
}

const getCardName = (type: Opportunity["type"]) => {
  // biome-ignore format: easy reading
  switch (type) {
    case "question":   return "Trivia"
    case "search":     return "Search"
    case "generative": return "Imagining"
    default:           return "Unknown"
  }
}

const getCardColor = (type: Opportunity["type"]) => {
  // biome-ignore format: easy reading
  switch (type) {
    case "question":   return "bg-blue-50 border-blue-200"
    case "search":     return "bg-green-50 border-green-200"
    case "generative": return "bg-purple-50 border-purple-200"
    default:           return "bg-gray-50 border-gray-200"
  }
}

interface OpportunityParams {
  opportunities: Opportunity[]
  dismissCard: (id: string) => void
}

export function OpportunityPanel({
  opportunities,
  dismissCard,
}: OpportunityParams) {
  const panelRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = useSmartAutoscroll(panelRef)

  // biome-ignore lint/correctness/useExhaustiveDependencies: any change to the transcript triggers scrollToEnd
  useEffect(() => {
    setTimeout(scrollToEnd, 100)
  }, [opportunities])

  /* Opportunity Cards Panel */
  return (
    <div
      className="w-full h-full mt-8 flex flex-col gap-4 overflow-y-auto"
      ref={panelRef}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assistant Cards</CardTitle>
          <p className="text-sm text-slate-600">
            Contextual assistance based on your conversation
          </p>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {opportunities.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <div className="text-slate-400 mb-2">
                <Search className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No opportunities detected yet</p>
                <p className="text-xs mt-1">
                  Cards will appear here when the AI identifies ways to help
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          opportunities.map((card) => (
            <Card
              key={card.id}
              className={`mb-4 ${getCardColor(card.type)} transition-all duration-300 hover:shadow-md`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getCardIcon(card.type)}
                    <Badge variant="secondary" className="text-xs capitalize">
                      {getCardName(card.type)}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissCard(card.id)}
                    className="h-6 w-6 p-0"
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4">
                  <OpportunityCard opportunity={card} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function QuestionCard({ opportunity }: { opportunity: QuestionOpportunity }) {
  const [showMore, setShowMore] = useState(false)

  const handleShowMore = () => setShowMore(true)

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 italic my-3">{opportunity.trigger}</p>
      <p className="text-sm font-medium text-slate-800 mt-3 mb-5">
        {opportunity.shortAnswer}
      </p>
      {showMore ? (
        <p className="text-md font-medium text-slate-800 my-6 pl-4 border-l-2 border-amber-500">
          {opportunity.longAnswer}
        </p>
      ) : (
        <Button onClick={handleShowMore}>Show more</Button>
      )}
      <p className="text-xs text-slate-500">
        {new Date(opportunity.timestamp).toLocaleTimeString()}
      </p>
    </div>
  )
}

function SearchCard({ opportunity }: { opportunity: SearchOpportunity }) {
  return (
    <>
      <div className="w-full space-y-2">
        <p className="text-sm font-medium text-slate-800">
          {opportunity.answer}
        </p>
        <p className="text-xs text-slate-600 italic">
          {opportunity.searchQuery}
        </p>
        <div className="flex flex-col gap-6 py-4 px-10">
          <Carousel>
            <CarouselPrevious />
            <CarouselContent>
              {opportunity.results.map((r) => (
                <CarouselItem className="max-w-2/3" key={r.url}>
                  <div className="w-full border rounded-2xl p-3 text-sm">
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselNext />
          </Carousel>

          <Carousel>
            <CarouselPrevious />
            <CarouselContent>
              {opportunity.images.map((i) => (
                <CarouselItem
                  className="max-w-1/3 flex items-center"
                  key={i.url}
                >
                  <img
                    key={i.url}
                    src={i.url}
                    alt={i.description}
                    className="w-full"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselNext />
          </Carousel>
        </div>
        <p className="text-xs text-slate-500">
          {new Date(opportunity.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </>
  )
}

function GenerativeCard({
  opportunity,
}: { opportunity: GenerativeOpportunity }) {
  return (
    <>
      <div className="flex-1/2 space-y-2">
        <p className="text-sm font-medium text-slate-800">
          {opportunity.imagePrompt}
        </p>
        <p className="text-xs text-slate-600 italic">{opportunity.trigger}</p>
        <p className="text-xs text-slate-500">
          {new Date(opportunity.timestamp).toLocaleTimeString()}
        </p>
      </div>
      <div className="flex-1/2">
        <img
          className="object-cover rounded-md"
          src={opportunity.imageUrl}
          alt="generated"
        />
      </div>
    </>
  )
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  switch (opportunity.type) {
    case "question":
      return <QuestionCard opportunity={opportunity} />
    case "search":
      return <SearchCard opportunity={opportunity} />
    case "generative":
      return <GenerativeCard opportunity={opportunity} />
  }
  throw new Error("Unknown card type")
}
