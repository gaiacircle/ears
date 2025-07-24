import { HelpCircle, ImageIcon, Search } from "lucide-react"

import type { OpportunityCard } from "@/types/opportunity-card"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const getCardIcon = (type: string) => {
	switch (type) {
		case "question":
			return <HelpCircle className="w-4 h-4" />
		case "memory":
			return <Search className="w-4 h-4" />
		case "generative":
			return <ImageIcon className="w-4 h-4" />
		default:
			return <HelpCircle className="w-4 h-4" />
	}
}

const getCardColor = (type: string) => {
	switch (type) {
		case "question":
			return "bg-blue-50 border-blue-200"
		case "memory":
			return "bg-green-50 border-green-200"
		case "generative":
			return "bg-purple-50 border-purple-200"
		default:
			return "bg-gray-50 border-gray-200"
	}
}

interface OpportunityParams {
	opportunityCards: OpportunityCard[]
	dismissCard: (id: string) => void
}

export function OpportunityPanel({
	opportunityCards,
	dismissCard,
}: OpportunityParams) {
	/* Opportunity Cards Panel */
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Assistant Cards</CardTitle>
					<p className="text-sm text-slate-600">
						Contextual assistance based on your conversation
					</p>
				</CardHeader>
			</Card>

			<div className="space-y-4 max-h-[520px] overflow-y-auto">
				{opportunityCards.length === 0 ? (
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
					opportunityCards.map((card) => (
						<Card
							key={card.id}
							className={`${getCardColor(card.type)} transition-all duration-300 hover:shadow-md`}
						>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										{getCardIcon(card.type)}
										<Badge variant="secondary" className="text-xs capitalize">
											{card.type}
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
								<div className="space-y-2">
									<p className="text-sm font-medium text-slate-800">
										{card.content}
									</p>
									<p className="text-xs text-slate-600 italic">
										{card.explanation}
									</p>
									<p className="text-xs text-slate-500">
										{new Date(card.timestamp).toLocaleTimeString()}
									</p>
								</div>
							</CardContent>
						</Card>
					))
				)}
			</div>
		</div>
	)
}
