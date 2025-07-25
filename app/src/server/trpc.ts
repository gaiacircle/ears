import { createTogetherAI } from "@ai-sdk/togetherai"
import { initTRPC } from "@trpc/server"
import { generateObject } from "ai"
import { z } from "zod"
import { uuidv7 as uuid } from "uuidv7"

const togetherai = createTogetherAI({
  apiKey: process.env.TOGETHER_AI_API_KEY,
})

const t = initTRPC.create()

const OpportunityBaseSchema = z.object({
  type: z.enum(["question", "memory", "generative"]),
  trigger: z.string(),
  content: z.string(),
  explanation: z.string(),
})

const OpportunityInferenceSchema = z.object({
  opportunities: z.array(OpportunityBaseSchema),
})

export const appRouter = t.router({
  chat: t.procedure
    .input(
      z.object({
        recentMessages: z.string().array(),
        recentOpportunities: z.string().array(),
      }),
    )
    .mutation(async ({ input: { recentMessages, recentOpportunities } }) => {
      const transcript = recentMessages.slice(0, -1)
      const mostRecentMessage = recentMessages[recentMessages.length - 1]

      console.log("chat", transcript, mostRecentMessage)

      if (!mostRecentMessage) {
        return { opportunities: [] }
      }

      const { object } = await generateObject<
        z.infer<typeof OpportunityInferenceSchema>
      >({
        model: togetherai("moonshotai/Kimi-K2-Instruct"),
        schema: OpportunityInferenceSchema,
        messages: [
          {
            role: "system" as const,
            content: `
							Analyze this conversation transcript and identify opportunities for assistance based on the most recent message. 
							Look for these specific types:
							
							1. QUESTION/UNKNOWN: When speakers express ignorance or ask questions they don't know the answer to
								- Examples: "I wonder if...", "Do you know...", "Is there a way to..."
							
							2. MEMORY RETRIEVAL: When speakers try to recall something specific but can't fully remember
								- Examples: "I saw this article...", "There was this study...", "I read somewhere..."
							
							3. GENERATIVE MOMENT: When speakers engage in "what if" scenarios or imagine something that doesn't exist
								- Examples: "What if we could...", "Imagine if...", "Picture this..."
							
							For each opportunity found:
							- Generate helpful content (search results, explanations, or creative descriptions)
							- Explain why this card appeared based on what was said
							- Make it contextually relevant and unobtrusive
							- Respond in no more than a dozen words
							
              For context only:

              <context-opportunities-already-given>
              ${recentOpportunities.join("\n\n")}
              </context-opportunities-already-given>

							<context-transcript>
							${transcript.join("\n\n")}
							</context-transcript>

              The focus of our analysis:

              <most-recent-message>
              ${mostRecentMessage}
              </most-recent-message>
							
							Only return opportunities that are clearly identifiable and would genuinely help the conversation based on the most recent message.
              Do not repeat opportunities that have already been given.
              Do not ask questions.
							If no clear opportunities exist, return an empty array.
						`,
          },
          ...recentMessages.map((m) => ({ role: "user" as const, content: m })),
        ],
      })
      return {
        opportunities: object.opportunities.map((o) => ({
          ...o,
          id: uuid(),
          timestamp: Date.now(),
        })),
      }
    }),
})
export type AppRouter = typeof appRouter
