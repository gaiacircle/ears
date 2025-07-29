import { initTRPC } from "@trpc/server"
import { generateObject } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import Replicate from "replicate" // for image gen
import { z } from "zod"
import { uuidv7 as uuid } from "uuidv7"
import unindent from "@nrsk/unindent"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  extraBody: {
    provider: {
      only: ["novita"],
    },
  },
})

const replicate = new Replicate()

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
        recentMessages: z.string().array().min(1),
        recentOpportunities: z.string().array(),
      }),
    )
    .mutation(async ({ input: { recentMessages, recentOpportunities } }) => {
      const messages = [
        {
          role: "system" as const,
          content: unindent(`
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
            
            Previous context:

            <context-opportunities-already-given>
            ${recentOpportunities.join("\n\n")}
            </context-opportunities-already-given>

            Only return opportunities that are clearly identifiable and would genuinely help the conversation based on the most recent message.
            Do not repeat opportunities that have already been given.
            Do not ask questions.
            If no clear opportunities exist, return an empty array.
					`),
        },
        ...recentMessages.map((m) => ({
          role: "user" as const,
          content: m,
        })),
      ]

      console.log("chat", {
        recentMessages,
        recentOpportunities,
      })

      const { object } = await generateObject<
        z.infer<typeof OpportunityInferenceSchema>
      >({
        // model: togetherai("moonshotai/Kimi-K2-Instruct"),
        // model: togetherai("Qwen/Qwen3-235B-A22B-Instruct-2507-tput"),
        // model: openrouter("moonshotai/kimi-k2"),
        model: openrouter("qwen/qwen3-235b-a22b-2507"),
        schema: OpportunityInferenceSchema,
        messages,
      })

      console.log("-> Opportunities:", object.opportunities)

      const imageEnhancedOpps: ((typeof object.opportunities)[number] & {
        imageUrl?: string
      })[] = []
      for (const opp of object.opportunities) {
        if (opp.type === "generative") {
          console.log("-> Enhancing generative opportunity with an image...")

          const output = (await replicate.run(
            "black-forest-labs/flux-schnell",
            {
              input: { prompt: `${recentMessages[0]}\n\n${opp.content}` },
            },
          )) as { url: () => { href: string } }[]

          const firstResponse = output[0]

          if (typeof firstResponse.url === "function") {
            const imageUrl = firstResponse.url().href
            console.log("-> image", imageUrl)
            imageEnhancedOpps.push({ ...opp, imageUrl })
            continue
          }
        }
        imageEnhancedOpps.push(opp)
      }
      console.log("-> Return", imageEnhancedOpps.length)

      return {
        opportunities: imageEnhancedOpps.map((o) => ({
          ...o,
          id: uuid(),
          timestamp: Date.now(),
        })),
      }
    }),
})

export type AppRouter = typeof appRouter
